# Native Plugin Release Hardening Plan

## Goal

After migrating the native engine libraries from `engine/src/main/jniLibs` to `app/src/main/nativeplugins`, ensure that both Debug and Release builds can reliably launch KRKR, ONS, and Artemis, and prevent R8 obfuscation from breaking JNI/reflection entry points.

## Checklist

- [x] Before launching a game, synchronously ensure that the corresponding native plugin is installed and complete.
- [x] The plugin installation logic must not rely solely on SharedPreferences markers; it must verify the required `.so` files and the manifest under `current/arm64-v8a`.
- [x] The default native loading path in `KR2Activity` was changed to the plugin loading fallback, preventing accidental loading of the removed `jniLibs` in the future.
- [x] Completed the release R8/ProGuard keep rules, covering the packages related to JNI, SDL, KRKR, ONS, Artemis, IJK, and the hook stub.
- [x] Ran `assembleDebug` and `assembleRelease` for verification.