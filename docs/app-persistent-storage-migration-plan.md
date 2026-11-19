# TyranorNext App Persistent Storage Migration and Performance Optimization Plan

> Generated: 2026-08-29  
> Based on document: `docs/app-persistent-data-inventory.md` (App Persistent Data Inventory)  
> Goal: Without breaking existing user data, the engine's cross-process read contracts, or backup behavior, migrate high-frequency collection-type data from SharedPreferences / custom text to a more suitable storage stack, improving game page, home page, cover refresh, directory sync and search/sort performance.

---

## I. Conclusion First

What this project most needs to optimize is not "migrate everything to SQLite", but rather moving **high-frequency read/write, collection-type, query/sort/partial-update data** to Room/SQLite.

Recommended final technology stack:

| Data type | Recommended technology | Reason |
|---|---|---|
| Game library master data, scan roots, recent games, quick launch, cover metadata, engine detection cache | Room + SQLite | Supports indexes, transactions, partial updates, Flow subscriptions, batch writes and consistency constraints |
| Hikarinagi OAuth token | EncryptedSharedPreferences / Android Keystore | This is a security problem, not a performance problem; tokens are not suitable for plain-text prefs |
| App appearance, language, theme, a few switches | Keep SharedPreferences, may later migrate to Preference DataStore | Small data volume, low read/write frequency, small benefit from migrating to SQLite |
| Engine global settings, native plugin install state, small amount of cross-process configuration | Keep SharedPreferences for now | Read directly by engine subprocesses; migrating to DB would add cross-process initialization and compatibility costs |
| Cover images, fonts, native so, saves, SAF shadow directories, patch overlay | Keep the filesystem | Binary large files are not suitable for DB; the DB stores only indexes and metadata |

Priority ordering:

1. P0: Migrate the game library, scan roots, recent games and quick launch in `game_scanner.xml`.
2. P0: Change cover metadata from rewriting the whole `ScanGame` list to a single DB row update.
3. P1: Migrate per-game override settings from JSON-in-XML in `tyranor_game_overrides.xml` to a Room table or a compatible Repository.
4. P1: Unify Artemis / Ren'Py / RPGM auto-detection cache into the DB.
5. P2: Change Hikarinagi token to encrypted storage.
6. P3: Optionally migrate App settings to DataStore, not a performance priority.

---

## II. Current Bottleneck Analysis

### 2.1 Game Library Master Data Bottleneck

The current core implementation is located at:

- `app/src/main/java/com/tyranor/next/core/game/scan/EngineScanner.kt`

Current state:

- `scan_games`: all game records are serialized into one string.
- One game per line, with fields separated by `\u0001`.
- `loadGames()` must read the whole string, split, and parse line by line.
- `updateGames()` rewrites the entire `scan_games` even when only one game cover changes.
- `recent_games` and `quick_launch` also duplicate full `ScanGame` snapshots.

Problems:

- As the number of games grows, cold start and page switching need to repeatedly construct large lists.
- Cover scraping that "refreshes one as soon as it is fetched" triggers multiple whole-library rewrites.
- Removing a directory, deleting a game, recent games and quick launch must be kept consistent manually, and the logic keeps getting more convoluted.
- Search and sort can only run on in-memory lists and cannot exploit indexes.
- The custom delimiter format is fragile, and field extensions require maintaining parse compatibility.

### 2.2 Per-Game Override Settings Bottleneck

The current core implementation is located at:

- `app/src/main/java/com/tyranor/next/core/settings/PerGameSettingsStore.kt`
- `engine/src/main/java/com/core/tyrano/TyranoActivity.kt`

Current state:

- Each game is keyed by `game.uri`.
- The value is a JSON string.
- A missing field means "follow global".
- The Tyrano engine process also reads the same prefs file directly to save touchpad configuration.

Problems:

- The data structure keeps growing: KR / Artemis / ONS / RPGM / Ren'Py / TouchPad are all mixed in one JSON.
- Changing a single field requires reading and writing back the entire JSON segment.
- Migration must be careful, because the engine side already has a direct-read contract.

### 2.3 Cover and Metadata Bottleneck

Current files:

- `app/src/main/java/com/tyranor/next/core/cover/CoverScrapeTaskManager.kt`
- `app/src/main/java/com/tyranor/next/core/cover/CoverScraperService.kt`
- `app/src/main/java/com/tyranor/next/core/cover/VndbCoverService.kt`

Current state:

- Image binaries are stored in `files/covers_remote/`.
- Metadata is written back to `ScanGame.coverUri / coverSource / vndbId / metadataTitle`.
- The write-back path still goes through `EngineScanner.updateGames()`.

Problems:

- The way cover files are stored is fine.
- What is actually inefficient is cover metadata updates: one game's cover change drags the whole library string with it.

### 2.4 Auto Engine Detection Cache Is Scattered

Current scattered locations:

- Artemis version memory in `EngineLauncher.kt`:
  - `artemis_engine.<pathHash>`
  - `artemis_engine_success.<pathHash>`
- `ScanGame.detectedRenpyVersion`
- `ScanGame.externalModuleAlias`

Problems:

- Auto-detection results, the game library, launch-success history and fingerprint hashes have no unified model.
- As mkxp-z, multiple Ren'Py versions and RPGM module versions are added later, prefs keys will keep expanding.

---

## III. Migration Goals

### 3.1 Performance Goals

- Game page cold loading no longer parses the entire `scan_games` text.
- Changing one cover updates only one DB row.
- Deleting a directory can transactionally delete all games under it, recent records and quick-launch records.
- Search, sort and filter-by-engine can use SQL indexes.
- Home and the game page subscribe to the same data source, reducing manual synchronization.

### 3.2 Stability Goals

- On first upgrade, automatically import data from the old SharedPreferences.
- Keep the old data for at least one version after a successful import, to allow rollback.
- Do not change the locations of existing game directories, save directories, cover files or font files.
- Do not affect engine subprocesses reading the necessary configuration.
- Do not require users to rescan directories.

### 3.3 Architecture Goals

Add a Repository layer so the UI does not depend directly on `EngineScanner`'s storage implementation:

```text
UI / ViewModel
└── GameLibraryRepository
    ├── Room DAO
    ├── Legacy SharedPreferences Importer
    └── EngineScanner scan/detection logic
```

`EngineScanner` will keep the "scan/detect" responsibility and gradually shed the "persistence repository" responsibility.

---

## IV. Recommended Database Design

### 4.1 `games`: Game Library Main Table

Purpose: replace `scan_games` in `game_scanner.xml`.

Suggested fields:

| Field | Type | Description |
|---|---|---|
| `uri` | TEXT PRIMARY KEY | Unique game identifier, reusing the existing `ScanGame.uri` |
| `root_uri` | TEXT | Owning scan root, used for bulk cleanup when deleting a directory |
| `title` | TEXT NOT NULL | Display title |
| `engine` | TEXT NOT NULL | `EngineType.name` |
| `launch_target` | TEXT NOT NULL DEFAULT '' | Auto-detected launch target |
| `launch_file` | TEXT NULL | User-specified launch file |
| `cover_uri` | TEXT NULL | Cover URI |
| `cover_source` | TEXT NULL | local/custom/vndb/steam/bangumi/hikarinagi |
| `vndb_id` | TEXT NULL | VNDB ID |
| `metadata_title` | TEXT NULL | Metadata title |
| `external_module_alias` | TEXT NULL | External APK sub-runtime alias |
| `detected_renpy_version` | TEXT NULL | Ren'Py version suggestion from the scan stage |
| `discovered_at` | INTEGER NOT NULL | First discovery time |
| `updated_at` | INTEGER NOT NULL | Last modification time |
| `last_opened_at` | INTEGER NOT NULL DEFAULT 0 | Last open time, can replace the recent snapshot |

Suggested indexes:

```sql
CREATE INDEX index_games_root_uri ON games(root_uri);
CREATE INDEX index_games_engine ON games(engine);
CREATE INDEX index_games_title ON games(title COLLATE NOCASE);
CREATE INDEX index_games_last_opened_at ON games(last_opened_at);
CREATE INDEX index_games_cover_uri ON games(cover_uri);
```

Benefits:

- `replaceGame()` can become a single-row `UPDATE`.
- Title search can be accelerated.
- Deleting a scan root can bulk-delete by `root_uri`.
- Recent games can be queried directly from `games.last_opened_at`.

### 4.2 `scan_roots`: Scan Root Directory Table

Purpose: replace the newline-separated `scan_roots` string.

Suggested fields:

| Field | Type | Description |
|---|---|---|
| `uri` | TEXT PRIMARY KEY | SAF tree URI or real path |
| `display_name` | TEXT NULL | Display name, can be cached |
| `added_at` | INTEGER NOT NULL | Add time |
| `scan_depth` | INTEGER NULL | Reserved: per-directory scan depth override |
| `last_scanned_at` | INTEGER NOT NULL DEFAULT 0 | Last scan time |

Benefits:

- The directory list on the settings page can subscribe directly.
- Adding/removing directories and cleaning up the game library can be placed in the same transaction.

### 4.3 `quick_launch`: Quick Launch Table

Purpose: replace the full game snapshots in `quick_launch`.

Suggested fields:

| Field | Type | Description |
|---|---|---|
| `game_uri` | TEXT PRIMARY KEY | References `games.uri` |
| `slot_index` | INTEGER NOT NULL | 0..2 |
| `updated_at` | INTEGER NOT NULL | Update time |

Suggested constraints:

- `FOREIGN KEY(game_uri) REFERENCES games(uri) ON DELETE CASCADE`
- `UNIQUE(slot_index)`

Benefits:

- After game title/cover changes, quick launch does not need snapshot synchronization.
- Quick launch is cleaned up automatically when a game is deleted.

### 4.4 `game_overrides`: Per-Game Override Table

Purpose: replace or stay compatible with `tyranor_game_overrides.xml`.

For the first phase, it is recommended not to split into dozens of columns all at once; instead use structured JSON partitions to reduce migration risk:

| Field | Type | Description |
|---|---|---|
| `game_uri` | TEXT PRIMARY KEY | Game ID |
| `kr_json` | TEXT NULL | KR overrides |
| `artemis_json` | TEXT NULL | Artemis overrides |
| `ons_json` | TEXT NULL | ONS overrides |
| `tyrano_json` | TEXT NULL | Tyrano / RPGM overrides |
| `renpy_json` | TEXT NULL | Ren'Py overrides |
| `touchpad_json` | TEXT NULL | Touchpad configuration |
| `updated_at` | INTEGER NOT NULL | Update time |

In the second phase, evaluate whether to split columns:

- Split columns for high-frequency filter fields.
- Keep low-frequency configuration as JSON.

Note:

- The Tyrano engine process currently reads and writes `tyranor_game_overrides.xml` directly.
- Therefore in the first phase it is recommended that the App layer migrate to the DB first but keep writing back a prefs mirror.
- Only after the engine side switches to reading through a unified bridge/repository should the old prefs be fully removed.

### 4.5 `engine_detection_cache`: Auto Engine Detection Cache Table

Purpose: unify auto-detection results for Artemis / Ren'Py / RPGM / mkxp-z and so on.

Suggested fields:

| Field | Type | Description |
|---|---|---|
| `game_uri` | TEXT PRIMARY KEY | Game ID |
| `engine` | TEXT NOT NULL | Engine type |
| `fingerprint_hash` | TEXT NULL | Fingerprint hash, used to determine whether the cache is stale |
| `artemis_version` | TEXT NULL | Auto-determined Artemis version |
| `artemis_success_version` | TEXT NULL | Most recent successful launch version |
| `renpy_version` | TEXT NULL | Auto-determined Ren'Py version |
| `rpgm_runtime` | TEXT NULL | RPGM sub-runtime |
| `mkxpz_supported` | INTEGER NULL | mkxp-z support determination |
| `confidence` | INTEGER NOT NULL DEFAULT 0 | Confidence |
| `reason` | TEXT NULL | Detection reason, useful for logs/details display |
| `updated_at` | INTEGER NOT NULL | Update time |

Benefits:

- Auto engine entries can have more stable "memory + fingerprint invalidation" logic.
- When troubleshooting later from user logs, the matched detection reason can be output.

### 4.6 `cover_jobs` / `cover_candidates`: Optional Cover Scraping Enhancements

This is not required in the first phase, but is suitable for later enhancement.

`cover_candidates` can store multiple candidates:

| Field | Type | Description |
|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Candidate ID |
| `game_uri` | TEXT NOT NULL | Game ID |
| `source` | TEXT NOT NULL | Source |
| `remote_id` | TEXT NULL | VNDB/Steam/Bangumi/Hikarinagi ID |
| `title` | TEXT NULL | Candidate title |
| `image_url` | TEXT NULL | Remote image URL |
| `score` | REAL NOT NULL DEFAULT 0 | Match score |
| `created_at` | INTEGER NOT NULL | Creation time |

Benefits:

- Supports "choose another candidate cover".
- Avoids repeatedly requesting the same candidate.

---

## V. What Is Not Recommended for Migration to SQLite

### 5.1 Global App Settings

File:

- `app_settings.xml`

Includes:

- Theme color
- Language
- Theme mode
- Tone switch
- Scan depth
- Game sort
- Cover source switches and order

Recommendation:

- Keep SharedPreferences for now.
- If modernization is desired, it can migrate to Preference DataStore.
- Migration to SQLite is not recommended, because the data is small, key-value typed, and has weak query needs.

### 5.2 Global Engine Settings

Files:

- `tyranor_prefs.xml`
- `onsyuri.xml`

Recommendation:

- Keep SharedPreferences for now.
- The reason is that engine subprocesses and vendored engine code may read prefs directly.
- Although cross-process SQLite reads/writes are feasible, initialization, locking, transactions and lifecycle must be handled; the benefit is not worth the risk.

### 5.3 Native Plugin Install State

Files:

- `rinne_native_plugin_overrides.xml`
- `native_plugin.*` in `tyranor_prefs.xml`

Recommendation:

- Keep SharedPreferences.
- Install state is a small number of keys and must be read quickly early in startup.
- The plugin entities `.so` and `manifest.json` continue to live on the filesystem.

### 5.4 Binary and Large Files

Includes:

- Cover images
- Fonts
- native so
- Saves
- SAF shadow tree
- `patch.tjs` overlay
- zip temporary files

Recommendation:

- Keep everything on the filesystem.
- SQLite stores only indexes such as path, hash, mtime and source.

---

## VI. Migration Roadmap

### Phase 0: Preparation and Protection

Goal: add the infrastructure without changing existing behavior.

Tasks:

1. Introduce the Room dependency.
2. Add `AppDatabase`.
3. Add Entity / DAO.
4. Add `GameLibraryRepository`.
5. Add a legacy importer that imports the DB from old prefs.
6. Add a migration-completed marker, e.g. `storage_migration_v1_done`.
7. Keep the original old prefs data; do not delete immediately.

Acceptance:

- Both Debug and Release compile.
- New installs with an empty DB do not crash.
- Existing users can import from old data on first launch.
- Repeated import is idempotent.

### Phase 1: Migrate Game Library Master Data

Goal: replace `scan_games` / `scan_roots` / `recent_games` / `quick_launch`.

Tasks:

1. Import `scan_roots` into the `scan_roots` table.
2. Import `scan_games` into the `games` table.
3. Merge `recent_games`' `openTime` into `games.last_opened_at`.
4. Import `quick_launch` into the `quick_launch` table, storing only `game_uri + slot_index`.
5. Change `EngineScanner.saveGames/loadGames/updateGames` to call the Repository or DAO.
6. Keep the old interface signatures to reduce the UI change surface.
7. Change `MainLibraryViewModel`'s published snapshot to read from the Repository.

Acceptance:

- Adding directories, deleting directories, scanning, incremental scanning and deleting games work normally.
- Home recent games and quick launch match the game page.
- After a cover update, quick launch shows the new cover.
- Users do not need to re-add directories.

### Phase 2: Cover Metadata Partial Updates

Goal: cover scraping no longer rewrites the whole library.

Tasks:

1. Add DAO methods:
   - `updateCover(gameUri, coverUri, coverSource, vndbId, metadataTitle, updatedAt)`
   - `clearCover(gameUri)`
2. Change `CoverScrapeTaskManager.persistScrapedCover()` to a single-row transactional update.
3. Make `VndbCoverService` manual cover replacement go through the same Repository.
4. Have `MainLibraryViewModel` subscribe to the DB Flow, reducing manual `MutableSharedFlow` synchronization pressure.

Acceptance:

- During one-tap cover fetching, each fetched cover refreshes immediately.
- The game list does not require scrolling to refresh.
- Batch scraping does not repeatedly rewrite a huge prefs string.

### Phase 3: Search and Sort Optimization

Goal: improve game page search speed and large-list switching performance.

Tasks:

1. Add DAO queries:
   - `observeGames(sortMode)`
   - `searchGames(query, sortMode)`
   - `observeGamesByEngine(engine)`
2. Use `LIKE '%' || :query || '%' COLLATE NOCASE` for title search.
3. If the game count becomes very large later, introduce SQLite FTS5:
   - `games_fts(title, metadata_title)`
4. Sorting strategy:
   - Default title sort uses `title COLLATE NOCASE`.
   - Tag grouping can add a precomputed `sort_tag` column, avoiding regex in the UI every time.

Acceptance:

- No lag while typing in search.
- With many games, page switching does not reconstruct unrelated lists.
- Results are stable after switching sort.

### Phase 4: Per-Game Override Settings Migration

Goal: migrate `tyranor_game_overrides.xml` from JSON-in-XML to DB management while maintaining engine compatibility.

Recommended transition strategy:

```text
App UI writes DB
      ↓
Repository writes a copy of the old prefs mirror synchronously
      ↓
Engine process still reads the old way
```

Tasks:

1. Import the old `tyranor_game_overrides.xml` into the `game_overrides` table.
2. Change the App-side `PerGameSettingsStore` into a Repository facade.
3. Each time the App modifies override settings:
   - Write the DB.
   - Synchronously generate the old JSON into prefs for the engine subprocess to read.
4. Do not migrate Tyrano `TouchPadSaveBridge` for now; keep writing the old prefs.
5. At App startup, detect whether the touchpad configuration in old prefs is newer than the DB, and backfill if necessary.

Acceptance:

- The per-game settings page displays correctly.
- KR / Artemis / ONS / RPGM / Ren'Py overrides still take effect.
- Tyrano touchpad layout saves are not lost.
- The engine process does not require a one-shot major change.

### Phase 5: Auto Engine Detection Cache Migration

Goal: unify auto engine version detection results.

Tasks:

1. Add `EngineDetectionRepository`.
2. Migrate the Artemis successful launch version from prefs to `engine_detection_cache`.
3. Write Ren'Py scan version suggestions into `engine_detection_cache`.
4. Write mkxp-z / RPGM external module detection results into the same table.
5. Add a fingerprint hash:
   - Hash of the key file name list.
   - mtime/size of key configuration files.
6. Automatically re-detect when the fingerprint changes.

Acceptance:

- Auto engine entries can explain "why this version was chosen".
- Cache invalidates automatically after a game upgrade or file change.
- Old prefs version memory can be imported.

### Phase 6: Sensitive Data Encryption

Goal: address the plain-text token risk in `hikarinagi_auth.xml`.

Tasks:

1. Introduce AndroidX Security Crypto.
2. Create `SecureAuthStore`.
3. On first launch, migrate the old token from `hikarinagi_auth.xml` to encrypted prefs.
4. Clear the old token fields after successful migration.
5. Continue to keep auth files excluded in backup rules.

Acceptance:

- Existing users do not lose their login state.
- Logout/token refresh work normally.
- Backups do not contain plain-text tokens.

---

## VII. Room Dependency Recommendation

`gradle/libs.versions.toml`:

```toml
[versions]
room = "2.8.0"

[libraries]
androidx-room-runtime = { module = "androidx.room:room-runtime", version.ref = "room" }
androidx-room-ktx = { module = "androidx.room:room-ktx", version.ref = "room" }
androidx-room-compiler = { module = "androidx.room:room-compiler", version.ref = "room" }

[plugins]
ksp = { id = "com.google.devtools.ksp", version = "2.3.20-2.0.0" }
```

`app/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.ksp)
}

dependencies {
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
}
```

Notes:

- KSP is recommended for the Room compiler.
- The version number must match the KSP version corresponding to the current Kotlin `2.3.20`.
- If the KSP version is temporarily unavailable, kapt can be used first, but it is not recommended long-term.

---

## VIII. Repository Interface Design

### 8.1 Game Library Interface

Recommended additions:

```kotlin
interface GameLibraryRepository {
    fun observeGames(): Flow<List<ScanGame>>
    fun observeRecentGames(limit: Int = 10): Flow<List<ScanGame>>
    fun observeQuickLaunch(): Flow<List<ScanGame>>
    suspend fun loadGames(): List<ScanGame>
    suspend fun saveScannedGames(games: List<ScanGame>, activeRoots: List<String>)
    suspend fun upsertGame(game: ScanGame)
    suspend fun updateGame(uri: String, transform: (ScanGame) -> ScanGame)
    suspend fun deleteGame(uri: String)
    suspend fun deleteRootAndGames(rootUri: String)
    suspend fun recordRecentGame(game: ScanGame)
    suspend fun setQuickLaunch(uri: String, enabled: Boolean): Boolean
}
```

### 8.2 Compatibility Layer Interface

To reduce the risk of a one-shot change, `EngineScanner` can temporarily keep its public API:

```text
EngineScanner.loadGames()
EngineScanner.updateGames()
EngineScanner.saveRoot()
EngineScanner.removeRootAndGames()
```

The internal implementation switches from SharedPreferences to the Repository.

After the UI stabilizes later, callers can gradually be changed to depend on the Repository directly.

---

## IX. Data Migration Strategy

### 9.1 Import Order

On first launch, execute:

1. Read the old `scan_roots`.
2. Import into the `scan_roots` table.
3. Read the old `scan_games`.
4. Write into the `games` table according to `root_uri` ownership.
5. Read the old `recent_games`, merge `openTime` into `games.last_opened_at`.
6. Read the old `quick_launch`, write into `quick_launch.slot_index` in the original order.
7. Read the old `tyranor_game_overrides`, write into the `game_overrides` table.
8. Read the old Artemis auto-version prefs, write into `engine_detection_cache`.
9. Write the migration-completed marker.

### 9.2 Idempotency Requirements

The migration must satisfy:

- Can be executed repeatedly.
- Does not insert duplicates.
- Does not overwrite newer covers and titles in the DB.
- If parsing an old record fails, skip only that single record and do not abort the whole migration.

### 9.3 Rollback Strategy

Within at least one version:

- Do not delete the old `game_scanner.xml`.
- Do not delete the old `tyranor_game_overrides.xml`.
- The App layer can continue to re-import from old prefs.

If DB initialization fails:

- Fall back to the old `EngineScanner` prefs implementation.
- Record logs.
- Do not affect the user's ability to launch games.

---

## X. Backup Strategy Adjustments

After migrating to Room, the following need updating:

- `app/src/main/res/xml/backup_rules.xml`
- `app/src/main/res/xml/data_extraction_rules.xml`

Recommendation:

| Data | Backed up? | Reason |
|---|---|---|
| Room game library DB | Yes | After migration, the user's game library, cover metadata and settings need to be preserved |
| Room WAL/SHM | No/can be excluded | Rebuildable; avoids inconsistent backups |
| auth encrypted prefs | No | Tokens must not be backed up |
| `noBackupFilesDir/krkr_saf_index` | No | May become invalid after SAF permission recovery; already in noBackup |
| cache | No | Rebuildable |

Note:

- SAF URI permissions cannot be restored through cloud backup.
- After restoring to a new device, scan roots may need re-authorization.
- The DB should mark root authorization state so the UI can prompt "directory needs re-authorization".

---

## XI. Estimated Performance Benefits

### Current Model

```text
Update one cover
→ load the entire scan_games string
→ split all games
→ parse all games
→ map all games
→ serialize all games
→ write back the SharedPreferences XML
```

### Post-Migration Model

```text
Update one cover
→ UPDATE games SET cover_uri=?, cover_source=? WHERE uri=?
→ Room Flow pushes the change
→ UI refreshes the single item
```

Expected benefits:

- The more games there are, the greater the benefit.
- Disk write volume drops significantly during batch cover scraping.
- Directory deletion/game deletion synchronization logic becomes simpler.
- Search and sort go from O(n) in-memory processing to indexable SQL queries.

---

## XII. Risks and Mitigations

| Risk | Description | Mitigation |
|---|---|---|
| Build chain becomes more complex after introducing Room | Requires KSP/kapt | First commit the dependency and an empty DB separately to verify Debug/Release |
| Fields missed during old data migration | `ScanGame` fields keep growing | Write migration unit tests covering the old line-based format |
| Engine subprocess cannot read per-game overrides | The engine currently reads prefs directly | Keep prefs mirror write-back in the first phase |
| DB and old prefs dual-write inconsistency | A common problem during transition | DB is authoritative; prefs are engine-compatible output |
| SAF root ownership determination is complex | Content URIs and real paths coexist | Reuse the `EngineScanner.isGameUnderRoot` logic and store root_uri during migration |
| User rolls back the version | The new version writes the DB, the old version reads prefs | Keep writing key fields to old prefs for at least one version |

---

## XIII. Suggested Implementation Breakdown

### PR 1: Database Infrastructure

- Add Room/KSP dependencies.
- Add DB / Entity / DAO.
- Add the migration importer.
- Do not change business callers.

### PR 2: Game Library Read/Write Switch

- Switch `EngineScanner`'s persistence layer to the Repository.
- Import the old `game_scanner.xml`.
- Keep the public API unchanged.

### PR 3: Cover Partial Updates

- Change cover scraping to single-row updates.
- UI subscribes to DB Flow.
- Remove redundant manual synchronization logic.

### PR 4: Search/Sort via SQL

- Search goes through the DAO.
- Tag sorting adds precomputed columns or SQL queries.
- Validate large-list performance.

### PR 5: Per-Game Override Migration

- App-layer settings migrate to the DB.
- Old prefs mirror write-back.
- Engine compatibility verification.

### PR 6: Auth Encryption Migration

- Introduce Security Crypto.
- Migrate the token.
- Update backup rules.

---

## XIV. Verification Checklist

### Build Verification

```bash
./gradlew :app:compileDebugKotlin :app:compileReleaseKotlin --no-daemon
./gradlew :app:assembleDebug :app:assembleRelease --no-daemon
```

### Data Migration Verification

- Add multiple directories and games on the old version.
- The game library still exists after upgrading to the new version.
- Recent games are in the correct order.
- The three quick-launch slots are correct.
- Covers, VNDB ID and metadata title are not lost.
- Game page and settings page stay in sync after deleting a directory.

### Performance Verification

- Cold start time with 100 / 500 / 1000 games.
- Game page search input latency.
- Whether the UI stutters during one-tap cover fetching.
- Whether page switching triggers unnecessary full parsing.

### Compatibility Verification

- KRKR launch.
- krkrsdl3 launch.
- Artemis auto-version launch.
- Ren'Py external module jump.
- RPGM external module jump.
- ONS scoped save.
- Tyrano / RPG MV/MZ independent saves.

---

## XV. Final Recommended Implementation Path

It is most recommended to start from P0:

```text
Room infrastructure
→ import old game_scanner.xml
→ land games / scan_roots / quick_launch tables
→ switch EngineScanner persistence layer
→ single-row cover metadata updates
→ search/sort via SQL
```

This group yields the largest performance benefit with the smallest risk to engine launch.

Per-game override settings and token encryption can be done independently later, avoiding a single PR that touches the UI, scanning, engine processes and secure storage at the same time and making problems hard to localize.