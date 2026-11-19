# docs Directory Index

Documents in `docs/` are topic plans and records, preserving the context and conclusions at the time of creation. Current implementation behavior follows [SPEC.md](../SPEC.md) and [ARCHITECTURE.md](../ARCHITECTURE.md) in the repository root. Documents without status labels do not necessarily mean their content is still valid; cross-check with current code and the two documents above before referencing.

This index lists `docs/*.md` by category (excluding `docs/adr/`, `docs/reviews/`, `docs/skills/`, and this file itself). Subdirectories are listed separately at the end.

## Engine Integration

- [AVG32 / RealLive / UK2 Three-Engine Integration Plan (framebuffer engine group)](AVG32-RealLive-UK2引擎接入方案.md)
- [Artemis Automatic Engine Recognition Optimization Plan](Artemis自动引擎识别优化计划方案.md)
- [Artemis "Add Basic Patch / Add Windows Environment Patch" Reverse Analysis](Artemis基础补丁与Windows环境补丁逆向分析.md)
- [Artemis Ogg Audio Compatibility Fix (Issue #111)](Artemis-Ogg音频兼容修复.md)
- [BGI Save Loading Fix Implementation Plan](BGI宿主存档读取修复实施计划.md)
- [CMVS (cmvs-rs) Engine Integration Plan](CMVS-cmvs-rs引擎接入方案.md)
- [Ethornell / BGI (ethornell-rs) Android Port and Built-in Engine Integration Plan](Ethornell-BGI-Android化移植计划方案.md)
- [Ethornell / BGI Host Refactoring Plan](Ethornell-BGI-宿主重构计划方案.md)
- [FVPEngine (rfvp) Built-in Engine Integration Plan](FVP引擎接入方案.md)
- [FVP Custom Font (User Font Replacement) Integration Plan](FVP自定义字体接入方案.md)
- [PC Game Type Integration Plan (Manual Addition + External Winlator Launch)](PC游戏类型接入方案.md)
- [SiglusEngine (siglus_rs) Built-in Engine Integration Plan](Siglus引擎接入方案.md)
- [SoftPAL (sena-rs) Engine Integration Plan](SoftPAL-sena-rs引擎接入方案.md)
- [System3.x (xsystem35-sdl2) Built-in Engine Integration Plan](System35-xsystem35-引擎接入方案.md)
- [System4 (xsystem4) Built-in Engine Integration Plan](System4-xsystem4-引擎接入方案.md)
- [krkrsdl3 Engine Shell Configuration Capability List and TyranorNext Improvement Plan](krkrsdl3-engine-config-plan.md)
- [Ren'Py 8.5.3 External Module Integration Analysis](renpy-8.5.3-module-analysis.md)
- [External APK Engine Module Integration Plan](外置APK引擎模块接入方案.md)
- [External Ren'Py Module Configuration Integration Engine Settings List Plan](外置RenPy模块配置接入引擎设置清单计划.md)
- [External RPGM Module Configuration Integration Engine Settings List Plan](外置RPGM模块配置接入引擎设置清单计划.md)
- [External Ruffle Module Integration Plan (SWF / Flash)](外置Ruffle模块接入方案.md)
- [External Host Emulator Jump Integration Plan (PPSSPP / Eden / Winlator)](外置主机模拟器跳转接入方案.md)
- [Third-Party APK Runtime Module Integration Plan (Plan)](第三方APK运行时模块接入方案.md)
- [Third-Party APK Runtime Module Integration Guide](第三方APK运行时模块接入指南.md)
- [Third-Party APK Runtime Module Single-Game Engine Configuration and Save Management Plan](第三方APK运行时模块单游戏引擎配置计划.md)
- [Unified Engine Host Launch Loading Interface Implementation Plan](统一引擎宿主启动加载界面实施计划.md)
- [Localization Patch Font Mapping Porting Adaptation Notes](汉化补丁字体映射移植适配说明.md)

## Architecture and UI

- [Settings Page Miuix Migration Implementation Plan](miuix-settings-migration-plan.md)
- [Three-Layer Architecture Directory Classification Optimization Plan](三层架构目录归类优化方案.md)
- [TyranorNext App Multilingual Text Switching Support Plan](三语言文本切换支持计划方案.md)
- [Input Remapping and Gamepad Mapping Plan (Editable Virtual Keys + Gamepad Key Remapping)](输入重映射与手柄映射方案.md)
- [Tablet Sidebar Navigation Adaptation Plan](平板侧栏导航适配方案.md)
- [Application Layer Page Switching Performance Optimization Plan](应用层页面切换性能优化方案.md)
- [TyranorNext App Persistent Storage Migration and Performance Optimization Plan](应用持久化存储迁移与性能优化计划方案.md)
- [TyranorNext Architecture Optimization Plan](架构优化整理方案.md)
- [Glass Style Theme Plan](玻璃风格主题计划方案.md)
- [Liquid Glass Enhancement Plan](液态玻璃增强计划方案.md)
- [Advanced Glass Appearance Style Plan (including "Glass → Retro Glass" rename)](高级玻璃外观风格计划方案.md)
- [Filter Texture Orientation Interface](graphics-filter-coordinates.md)
- [Shared Image Quality Filter Chain](graphics-filters.md)
- [Kirikiroid2 1.2.6 and krkrsdl3 Image Quality Filter Integration](krkr-local-raw-filters.md)
- [VN-SR Filter Set](vnsr-filters.md)

## Saves and Network

- [Web Shell Fixed Port and Save Domain (Tyrano / WebOther / VN)](Web壳固定端口与存档域.md)
- [TyranorNext App Persistent Data Inventory](应用持久化数据清单.md)

## Tools and Build

- [RPG Maker MV/MZ Game Modifier Implementation Plan](RPGMaker修改器实施方案.md)
- [XP3 Unpack/Pack Function Plan (Unpack/Pack Independent Tool Page)](XP3拆封包功能方案.md)
- [Native Plugin Release Hardening Plan](native-plugin-release-hardening-plan.md)

## Acceptance / History

- [Ethornell Test Acceptance Record](Ethornell测试验收记录.md)
- [WebDAV Android Device Acceptance Record](WebDAV-device-acceptance.md)
- [Application Layer Code Review Issue List](应用层代码审查问题清单.md)
- Play status / four-source binding audit snapshots (nine files: `play-status-audit-20261114.md`, `play-status-audit-20261115.md`, `play-status-audit-20261115-cf56a52e.md`, `play-status-audit-20261115-post-cf56a52e.md`, `play-status-audit-20261115-r5.md`, `play-status-audit-20261115-r6.md`, `play-status-audit-20261116.md`, `play-status-audit-20261116-r8.md`, `play-status-audit-20261116-r9.md`): Branch `codex/bangumi-vndb-play-status` round-by-round audit/fix records; snapshot timeliness — each is valid only for its labeled HEAD version; current behavior follows SPEC.md and ARCHITECTURE.md, cross-round summary rulings follow each round's summary report.

## ADR

- [0001 SDL2 runtime library shared by System35 and System4 (libSDL2x + app32)](adr/0001-sdl2-shared-libsdl2x-app32.md)
- [0002 Built-in native engine libraries imported as prebuilt .so, source code and modification declarations placed in fork](adr/0002-prebuilt-engine-libs-source-in-fork.md)

## Review Templates

- [Review Template Directory Description](reviews/README.md)
- [PR Review Response Template](reviews/PR-REVIEW-TEMPLATE.md)
