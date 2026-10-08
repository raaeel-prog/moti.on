// Versioned single-request stdin/stdout protocol. No credential arguments or files.
#include <iostream>
#include <string>
#include <vector>
#if defined(__APPLE__)
#include <Security/Security.h>
#elif defined(_WIN32)
#include <windows.h>
#include <wincred.h>
#endif
static bool decode(const std::string& s, std::string& out) {
 if(s.size()%2) return false;
 for(size_t i=0;i<s.size();i+=2){unsigned value=0;for(int j=0;j<2;j++){char c=s[i+j];if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')))return false;value=value*16+(c<='9'?c-'0':c-'a'+10);}out.push_back(static_cast<char>(value));}return true;
}
static std::string encode(const std::string& s){const char* hex="0123456789abcdef";std::string out;for(unsigned char c:s){out+=hex[c>>4];out+=hex[c&15];}return out;}
int main(int argc,char**){
 if(argc!=1){std::cout<<"1\terror\n";return 1;}
 std::string line;char c;while(std::cin.get(c)&&c!='\n'){if(line.size()>=12000){std::cout<<"1\terror\n";return 1;}line+=c;}
 std::vector<std::string> parts;size_t start=0,pos;while((pos=line.find('\t',start))!=std::string::npos){parts.push_back(line.substr(start,pos-start));start=pos+1;}parts.push_back(line.substr(start));
 if(parts.size()!=4||parts[0]!="1"||(parts[1]!="read"&&parts[1]!="write"&&parts[1]!="remove")||parts[2].size()!=64||parts[2].find_first_not_of("0123456789abcdef")!=std::string::npos){std::cout<<"1\terror\n";return 1;}
 std::string value;if(!decode(parts[3],value)||value.size()>2560||(parts[1]!="write"&&!value.empty())){std::cout<<"1\terror\n";return 1;}
 std::string key="com.motion.account."+parts[2],result;bool ok=false,missing=false;
#if defined(__APPLE__)
 CFStringRef account=CFStringCreateWithCString(nullptr,key.c_str(),kCFStringEncodingUTF8);
 CFMutableDictionaryRef query=CFDictionaryCreateMutable(nullptr,0,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);
 CFDictionarySetValue(query,kSecClass,kSecClassGenericPassword);CFDictionarySetValue(query,kSecAttrService,CFSTR("com.motion.account.v1"));CFDictionarySetValue(query,kSecAttrAccount,account);
 OSStatus status=errSecParam;
 if(parts[1]=="read") {CFDictionarySetValue(query,kSecReturnData,kCFBooleanTrue);CFTypeRef data=nullptr;status=SecItemCopyMatching(query,&data);if(status==errSecSuccess&&data&&CFGetTypeID(data)==CFDataGetTypeID()){auto bytes=static_cast<CFDataRef>(data);result.assign(reinterpret_cast<const char*>(CFDataGetBytePtr(bytes)),CFDataGetLength(bytes));}if(data)CFRelease(data);}
 else if(parts[1]=="remove")status=SecItemDelete(query);
 else {CFDataRef data=CFDataCreate(nullptr,reinterpret_cast<const UInt8*>(value.data()),value.size());CFMutableDictionaryRef update=CFDictionaryCreateMutable(nullptr,0,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);CFDictionarySetValue(update,kSecValueData,data);status=SecItemUpdate(query,update);if(status==errSecItemNotFound){CFDictionarySetValue(query,kSecValueData,data);status=SecItemAdd(query,nullptr);}CFRelease(update);CFRelease(data);}
 ok=status==errSecSuccess;missing=status==errSecItemNotFound;CFRelease(query);CFRelease(account);
#elif defined(_WIN32)
 std::wstring target(key.begin(),key.end());
 if(parts[1]=="read"){PCREDENTIALW credential=nullptr;ok=CredReadW(target.c_str(),CRED_TYPE_GENERIC,0,&credential)!=0;if(ok){result.assign(reinterpret_cast<const char*>(credential->CredentialBlob),credential->CredentialBlobSize);CredFree(credential);}else missing=GetLastError()==ERROR_NOT_FOUND;}
 else if(parts[1]=="remove"){ok=CredDeleteW(target.c_str(),CRED_TYPE_GENERIC,0)!=0;if(!ok)missing=GetLastError()==ERROR_NOT_FOUND;}
 else{CREDENTIALW credential={};credential.Type=CRED_TYPE_GENERIC;credential.TargetName=const_cast<wchar_t*>(target.c_str());credential.Persist=CRED_PERSIST_LOCAL_MACHINE;credential.CredentialBlobSize=static_cast<DWORD>(value.size());credential.CredentialBlob=reinterpret_cast<LPBYTE>(&value[0]);ok=CredWriteW(&credential,0)!=0;}
#endif
 if(ok)std::cout<<"1\tok\t"<<encode(result)<<"\n";else if(missing)std::cout<<"1\tmissing\n";else std::cout<<"1\terror\n";
 return ok||missing?0:1;
}
