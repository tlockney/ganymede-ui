// rusty_v8's iOS libraries are built without WebAssembly, but its C
// bindings (binding.o, `v8__WasmModuleCompilation__*`) still call
// v8::WasmModuleCompilation, so the iOS app and its tests don't link
// (#698). These stand in for those members. Nothing in ganymede-ffi
// compiles WebAssembly, so none of them is called; if one is, it traps
// rather than run with a half-built object. The macOS library has
// WebAssembly, so only the iOS targets compile this file.

#define GANYMEDE_V8_WASM_STUB(local, symbol) \
  void local(void) __asm__(symbol);          \
  void local(void) { __builtin_trap(); }

GANYMEDE_V8_WASM_STUB(ganymede_wasm_ctor, "__ZN2v821WasmModuleCompilationC1Ev")
GANYMEDE_V8_WASM_STUB(ganymede_wasm_dtor, "__ZN2v821WasmModuleCompilationD1Ev")
GANYMEDE_V8_WASM_STUB(ganymede_wasm_on_bytes,
                      "__ZN2v821WasmModuleCompilation15OnBytesReceivedEPKhm")
GANYMEDE_V8_WASM_STUB(
    ganymede_wasm_set_compiled,
    "__ZN2v821WasmModuleCompilation25SetHasCompiledModuleBytesEv")
GANYMEDE_V8_WASM_STUB(
    ganymede_wasm_set_serialize_cb,
    "__ZN2v821WasmModuleCompilation39SetMoreFunctionsCanBeSerializedCallbackENSt4__Cr8functionIFvNS_18CompiledWasmModuleEEEE")
GANYMEDE_V8_WASM_STUB(ganymede_wasm_abort,
                      "__ZN2v821WasmModuleCompilation5AbortEv")
GANYMEDE_V8_WASM_STUB(
    ganymede_wasm_finish,
    "__ZN2v821WasmModuleCompilation6FinishEPNS_7IsolateERKNSt4__Cr8functionIFvRNS_13WasmStreaming22ModuleCachingInterfaceEEEERKNS4_IFvNS3_7variantIJNS_5LocalINS_16WasmModuleObjectEEENSD_INS_5ValueEEEEEEEEE")
GANYMEDE_V8_WASM_STUB(ganymede_wasm_set_url,
                      "__ZN2v821WasmModuleCompilation6SetUrlEPKcm")
