// Minimal strict JSON for the Windows Live Gestures transport (request.json is
// at most 8 KB, written by the Moti.on panel). macOS uses NSJSONSerialization
// for the same protocol. Parsing is bounded (depth, size) and never throws.
#pragma once
#include <charconv>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <string>
#include <utility>
#include <vector>

namespace mjson {

struct Value {
    enum Type { Null, Bool, Number, String, Array, Object };
    Type type = Null;
    bool boolean = false;
    double number = 0;
    std::string text;  // UTF-8
    std::vector<Value> items;
    std::vector<std::pair<std::string, Value>> fields;

    const Value* get(const char* key) const {
        for (const auto& field : fields) if (field.first == key) return &field.second;
        return nullptr;
    }
};

/** UTF-16 code units of a UTF-8 string: the unit NSString.length counts on macOS. */
inline size_t utf16Length(const std::string& s) {
    size_t units = 0;
    for (size_t i = 0; i < s.size(); ++i) {
        const unsigned char c = static_cast<unsigned char>(s[i]);
        if ((c & 0xC0) == 0x80) continue;
        units += (c >= 0xF0) ? 2 : 1;
    }
    return units;
}

/** A non-empty string of at most `max` UTF-16 units (same rule as the macOS bridge). */
inline bool isString(const Value* v, size_t max) {
    return v && v->type == Value::String && !v->text.empty() && utf16Length(v->text) <= max;
}
/** A finite number; booleans are never numbers. */
inline bool isNumber(const Value* v) { return v && v->type == Value::Number && std::isfinite(v->number); }

namespace detail {
struct Parser {
    const std::string& s;
    size_t i = 0;
    int depth = 0;
    explicit Parser(const std::string& text) : s(text) {}

    void ws() { while (i < s.size() && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) ++i; }
    bool literal(const char* word) {
        size_t n = 0; while (word[n]) ++n;
        if (s.compare(i, n, word) != 0) return false;
        i += n; return true;
    }
    static void append(std::string& out, uint32_t cp) {
        if (cp < 0x80) out += static_cast<char>(cp);
        else if (cp < 0x800) { out += static_cast<char>(0xC0 | (cp >> 6)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
        else if (cp < 0x10000) { out += static_cast<char>(0xE0 | (cp >> 12)); out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
        else { out += static_cast<char>(0xF0 | (cp >> 18)); out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F)); out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
    }
    bool hex4(uint32_t& out) {
        if (i + 4 > s.size()) return false;
        out = 0;
        for (int k = 0; k < 4; ++k) {
            const char c = s[i++]; out <<= 4;
            if (c >= '0' && c <= '9') out |= c - '0';
            else if (c >= 'a' && c <= 'f') out |= c - 'a' + 10;
            else if (c >= 'A' && c <= 'F') out |= c - 'A' + 10;
            else return false;
        }
        return true;
    }
    /** One well-formed UTF-8 sequence starting at s[i] (no overlongs, surrogates or > U+10FFFF). */
    bool utf8() {
        const unsigned char lead = static_cast<unsigned char>(s[i]);
        size_t extra = 0;
        uint32_t cp = 0, min = 0;
        if (lead >= 0xC2 && lead <= 0xDF) { extra = 1; cp = lead & 0x1F; min = 0x80; }
        else if (lead >= 0xE0 && lead <= 0xEF) { extra = 2; cp = lead & 0x0F; min = 0x800; }
        else if (lead >= 0xF0 && lead <= 0xF4) { extra = 3; cp = lead & 0x07; min = 0x10000; }
        else return false;
        if (i + extra >= s.size()) return false;
        for (size_t k = 1; k <= extra; ++k) {
            const unsigned char c = static_cast<unsigned char>(s[i + k]);
            if ((c & 0xC0) != 0x80) return false;
            cp = (cp << 6) | (c & 0x3F);
        }
        if (cp < min || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) return false;
        i += extra + 1;
        return true;
    }
    bool string(std::string& out) {
        if (i >= s.size() || s[i] != '"') return false;
        ++i;
        while (i < s.size()) {
            const unsigned char c = static_cast<unsigned char>(s[i]);
            if (c >= 0x80) {
                const size_t start = i;
                if (!utf8()) return false;
                out.append(s, start, i - start);
                continue;
            }
            ++i;
            if (c == '"') return true;
            if (c < 0x20) return false;
            if (c != '\\') { out += static_cast<char>(c); continue; }
            if (i >= s.size()) return false;
            const char e = s[i++];
            switch (e) {
                case '"': out += '"'; break; case '\\': out += '\\'; break; case '/': out += '/'; break;
                case 'b': out += '\b'; break; case 'f': out += '\f'; break; case 'n': out += '\n'; break;
                case 'r': out += '\r'; break; case 't': out += '\t'; break;
                case 'u': {
                    uint32_t cp = 0; if (!hex4(cp)) return false;
                    if (cp >= 0xD800 && cp <= 0xDBFF) {
                        uint32_t low = 0;
                        if (i + 2 > s.size() || s[i] != '\\' || s[i + 1] != 'u') return false;
                        i += 2; if (!hex4(low) || low < 0xDC00 || low > 0xDFFF) return false;
                        cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
                    } else if (cp >= 0xDC00 && cp <= 0xDFFF) return false;
                    if (cp == 0) return false;  // an embedded NUL would truncate C strings (tooltips, labels)
                    append(out, cp); break;
                }
                default: return false;
            }
        }
        return false;
    }
    bool number(double& out) {
        const size_t start = i;
        if (i < s.size() && s[i] == '-') ++i;
        if (i >= s.size()) return false;
        if (s[i] == '0') ++i;
        else if (s[i] >= '1' && s[i] <= '9') while (i < s.size() && s[i] >= '0' && s[i] <= '9') ++i;
        else return false;
        if (i < s.size() && s[i] == '.') { ++i; const size_t d = i; while (i < s.size() && s[i] >= '0' && s[i] <= '9') ++i; if (i == d) return false; }
        if (i < s.size() && (s[i] == 'e' || s[i] == 'E')) {
            ++i; if (i < s.size() && (s[i] == '+' || s[i] == '-')) ++i;
            const size_t d = i; while (i < s.size() && s[i] >= '0' && s[i] <= '9') ++i; if (i == d) return false;
        }
        // from_chars ignores the process locale (AE may run with a comma decimal separator).
        const char* first = s.data() + start;
        const char* last = s.data() + i;
        const auto result = std::from_chars(first, last, out);
        return result.ec == std::errc() && result.ptr == last && std::isfinite(out);
    }
    bool value(Value& out) {
        ws();
        if (i >= s.size()) return false;
        const char c = s[i];
        if (c == '{' || c == '[') {
            if (++depth > 16) return false;
            const bool ok = c == '{' ? object(out) : array(out);
            --depth; return ok;
        }
        if (c == '"') { out.type = Value::String; return string(out.text); }
        if (c == 't') { out.type = Value::Bool; out.boolean = true; return literal("true"); }
        if (c == 'f') { out.type = Value::Bool; out.boolean = false; return literal("false"); }
        if (c == 'n') { out.type = Value::Null; return literal("null"); }
        out.type = Value::Number; return number(out.number);
    }
    bool array(Value& out) {
        out.type = Value::Array; ++i; ws();
        if (i < s.size() && s[i] == ']') { ++i; return true; }
        while (true) {
            if (out.items.size() >= 256) return false;
            Value item; if (!value(item)) return false;
            out.items.push_back(std::move(item)); ws();
            if (i < s.size() && s[i] == ',') { ++i; continue; }
            if (i < s.size() && s[i] == ']') { ++i; return true; }
            return false;
        }
    }
    bool object(Value& out) {
        out.type = Value::Object; ++i; ws();
        if (i < s.size() && s[i] == '}') { ++i; return true; }
        while (true) {
            if (out.fields.size() >= 256) return false;
            ws(); std::string key; if (!string(key)) return false;
            ws(); if (i >= s.size() || s[i] != ':') return false; ++i;
            Value item; if (!value(item)) return false;
            // Duplicate keys are ambiguous between parsers: reject instead of guessing.
            for (const auto& field : out.fields) if (field.first == key) return false;
            out.fields.emplace_back(std::move(key), std::move(item)); ws();
            if (i < s.size() && s[i] == ',') { ++i; continue; }
            if (i < s.size() && s[i] == '}') { ++i; return true; }
            return false;
        }
    }
};
}  // namespace detail

/** Parses a complete document (no trailing data). Returns false on any error or when larger than `maxBytes`. */
inline bool parse(const std::string& text, Value& out, size_t maxBytes = 8192) {
    if (text.empty() || text.size() > maxBytes) return false;
    detail::Parser parser(text);
    Value result;
    if (!parser.value(result)) return false;
    parser.ws();
    if (parser.i != text.size()) return false;
    out = std::move(result);
    return true;
}

/** JSON string literal (UTF-8 passes through; control characters escaped). */
inline std::string quote(const std::string& s) {
    std::string out = "\"";
    for (unsigned char c : s) {
        if (c == '"') out += "\\\"";
        else if (c == '\\') out += "\\\\";
        else if (c < 0x20) { char buf[8]; std::snprintf(buf, sizeof buf, "\\u%04x", c); out += buf; }
        else out += static_cast<char>(c);
    }
    return out + "\"";
}

/** Integers up to 2^53 print exactly; other values round-trip with 17 digits. */
inline std::string number(double v) {
    char buf[40];
    if (!std::isfinite(v)) return "0";
    // to_chars is locale-independent and prints the shortest round-trip form.
    const auto result = (std::floor(v) == v && std::fabs(v) < 9007199254740992.0)
        ? std::to_chars(buf, buf + sizeof buf, static_cast<long long>(v))
        : std::to_chars(buf, buf + sizeof buf, v);
    return std::string(buf, result.ptr);
}

/** Flat object writer for the bridge's own replies. */
class Writer {
public:
    Writer& field(const char* key, const std::string& value) { return raw(key, quote(value)); }
    Writer& field(const char* key, const char* value) { return raw(key, quote(value)); }
    Writer& field(const char* key, double value) { return raw(key, number(value)); }
    Writer& field(const char* key, long long value) { return raw(key, number(static_cast<double>(value))); }
    Writer& field(const char* key, int value) { return raw(key, number(value)); }
    Writer& flag(const char* key, bool value) { return raw(key, value ? "true" : "false"); }
    Writer& raw(const char* key, const std::string& json) {
        body_ += (body_.empty() ? "" : ",") + quote(key) + ":" + json; return *this;
    }
    std::string str() const { return "{" + body_ + "}"; }
private:
    std::string body_;
};

}  // namespace mjson
