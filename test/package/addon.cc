#include <node.h>
#include <nan.h>

NAN_METHOD(check) {
  info.GetReturnValue().Set(Nan::New("prebuildify").ToLocalChecked());
}

NAN_MODULE_INIT(Init) {
  Nan::Export(target, "check", check);
}

NODE_MODULE(secp256k1, Init)
