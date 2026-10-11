// Windows side of the Live Gestures file transport (macOS: ~/Library/Caches/Moti.on/<folder>).
//
// Folder: %USERPROFILE%\AppData\Local\Moti.on\<folder>. The panel derives the
// same path from its own CEP extension path (which lives under the profile's
// AppData\Roaming), never from host- or user-supplied paths, so both sides use
// the profile folder instead of a possibly redirected LocalAppData.
// The profile folder is private to the user by default ACLs.
#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <shlobj.h>
#include <rpc.h>
#include <string>

namespace nativefiles {

inline std::wstring widen(const std::string& s) {
    if (s.empty()) return L"";
    const int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, s.data(), static_cast<int>(s.size()), nullptr, 0);
    if (n <= 0) return L"";
    std::wstring out(static_cast<size_t>(n), L'\0');
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, s.data(), static_cast<int>(s.size()), &out[0], n);
    return out;
}
inline std::string narrow(const wchar_t* s, size_t length) {
    if (!length) return "";
    const int n = WideCharToMultiByte(CP_UTF8, 0, s, static_cast<int>(length), nullptr, 0, nullptr, nullptr);
    if (n <= 0) return "";
    std::string out(static_cast<size_t>(n), '\0');
    WideCharToMultiByte(CP_UTF8, 0, s, static_cast<int>(length), &out[0], n, nullptr, nullptr);
    return out;
}

/** Creates (if needed) and returns the private folder, or an empty string. */
inline std::wstring root(const wchar_t* folder) {
    PWSTR profile = nullptr;
    if (FAILED(SHGetKnownFolderPath(FOLDERID_Profile, KF_FLAG_DEFAULT, nullptr, &profile)) || !profile) return L"";
    std::wstring path(profile);
    CoTaskMemFree(profile);
    path +=L"\\AppData\\Local\\Moti.on\\";
    path += folder;
    const int created = SHCreateDirectoryExW(nullptr, path.c_str(), nullptr);
    if (created != ERROR_SUCCESS && created != ERROR_ALREADY_EXISTS && created != ERROR_FILE_EXISTS) return L"";
    const DWORD attributes = GetFileAttributesW(path.c_str());
    if (attributes == INVALID_FILE_ATTRIBUTES || !(attributes & FILE_ATTRIBUTE_DIRECTORY) || (attributes & FILE_ATTRIBUTE_REPARSE_POINT)) return L"";
    return path;
}

inline std::wstring join(const std::wstring& dir, const wchar_t* name) { return dir + L"\\" + name; }

/** Reads a small regular file. Links/junctions (reparse points), directories and oversized files are refused. */
inline bool readSmall(const std::wstring& path, size_t maxBytes, std::string& out) {
    WIN32_FILE_ATTRIBUTE_DATA info{};
    if (!GetFileAttributesExW(path.c_str(), GetFileExInfoStandard, &info)) return false;
    if (info.dwFileAttributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_DEVICE)) return false;
    if (info.nFileSizeHigh || info.nFileSizeLow == 0 || info.nFileSizeLow > maxBytes) return false;
    HANDLE file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr,
        OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;
    LARGE_INTEGER size{};
    std::string bytes;
    bool ok = GetFileSizeEx(file, &size) && size.QuadPart > 0 && size.QuadPart <= static_cast<LONGLONG>(maxBytes);
    if (ok) {
        bytes.resize(static_cast<size_t>(size.QuadPart));
        DWORD read = 0;
        ok = ReadFile(file, &bytes[0], static_cast<DWORD>(bytes.size()), &read, nullptr) && read == bytes.size();
    }
    CloseHandle(file);
    if (ok) out.swap(bytes);
    return ok;
}

/** Complete file or nothing: write a sibling temp file, then replace the target. */
inline bool writeAtomic(const std::wstring& dir, const wchar_t* name, const std::string& text) {
    const std::wstring target = join(dir, name);
    const std::wstring temporary = target + L".native-tmp";
    HANDLE file = CreateFileW(temporary.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;
    DWORD written = 0;
    const bool ok = WriteFile(file, text.data(), static_cast<DWORD>(text.size()), &written, nullptr) && written == text.size();
    CloseHandle(file);
    if (!ok) { DeleteFileW(temporary.c_str()); return false; }
    // The panel may be reading the previous file for a moment: retry briefly instead of failing the reply.
    for (int attempt = 0; attempt < 5; ++attempt) {
        if (MoveFileExW(temporary.c_str(), target.c_str(), MOVEFILE_REPLACE_EXISTING)) return true;
        Sleep(2);
    }
    DeleteFileW(temporary.c_str());
    return false;
}

inline void remove(const std::wstring& dir, const wchar_t* name) { DeleteFileW(join(dir, name).c_str()); }

/** Random per-launch token, upper-case UUID text (same shape as NSUUID.UUIDString). */
inline std::string token() {
    UUID id{};
    if (UuidCreate(&id) != RPC_S_OK) return "";
    RPC_CSTR text = nullptr;
    if (UuidToStringA(&id, &text) != RPC_S_OK || !text) return "";
    std::string out(reinterpret_cast<const char*>(text));
    RpcStringFreeA(&text);
    for (char& c : out) if (c >= 'a' && c <= 'f') c = static_cast<char>(c - 'a' + 'A');
    return out;
}

}  // namespace nativefiles
