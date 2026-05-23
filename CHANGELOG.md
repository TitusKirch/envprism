# Changelog

## 0.1.0 (2026-05-23)


### Features

* **cli:** envprism diff command (text + json + check) ([05287e6](https://github.com/TitusKirch/envprism/commit/05287e6e7ce1a4f69d2e19934a2c59ecc83e11e7))
* **core,tui:** infer and render section banners from .env comments ([0a536b5](https://github.com/TitusKirch/envprism/commit/0a536b5bbe0ac47c83582bfe8b66dde942868ba6))
* **core:** discover env files, resolve base, build cell matrix ([4750f8a](https://github.com/TitusKirch/envprism/commit/4750f8ab0d300c4500909b2810e6239fb558236d))
* **core:** parse and serialize env files with byte-exact round-trip ([e6c5804](https://github.com/TitusKirch/envprism/commit/e6c5804c8ed395ad8319690f4c3a4fcd61d3d870))
* **core:** secret-key heuristic and value masking ([393a952](https://github.com/TitusKirch/envprism/commit/393a952703232096614759889e4f766fca7972df))
* pivot runtime to Bun for opentui compatibility ([0885e1f](https://github.com/TitusKirch/envprism/commit/0885e1f7291d8a92629956c8a1e8f84de10dfa98))
* **tui:** '?' opens a help overlay listing every keybinding ([19213c7](https://github.com/TitusKirch/envprism/commit/19213c757da271c034e6d0792223deb784c14326))
* **tui:** 'g' toggles section grouping between banners and key prefix ([3dbe51f](https://github.com/TitusKirch/envprism/commit/3dbe51f7bcdc74438d6e84c0bd932125ff58bd0e))
* **tui:** add and delete variables in the focused file ([d730a48](https://github.com/TitusKirch/envprism/commit/d730a48e67ed4f4c2bf91b9f3fa3efbcc278f0dc))
* **tui:** collapsible sections, placeholder detection, edit on missing ([9896fa6](https://github.com/TitusKirch/envprism/commit/9896fa6add0a4c1efeb426774452be0c80e88d27))
* **tui:** create new env file via 'n' ([e427de2](https://github.com/TitusKirch/envprism/commit/e427de2fd8571449f82773f94fc91dee76f749cb))
* **tui:** ctrl-z undoes the last edit/add/delete ([b85fac5](https://github.com/TitusKirch/envprism/commit/b85fac5246bb249182eaff42ec848cc3e926cbae))
* **tui:** dim scrim, base auto-enable, input on top, secrets toggle ([4cfe311](https://github.com/TitusKirch/envprism/commit/4cfe3118636e7a7636972e15640f23b747e722a4))
* **tui:** drift-only view toggle and quit confirmation ([8f79a8e](https://github.com/TitusKirch/envprism/commit/8f79a8e046228ba393ab58476072544ef790d5c4))
* **tui:** edit/add-value popup shows per-file context table ([6ff68e5](https://github.com/TitusKirch/envprism/commit/6ff68e5d0d61efea834828005432947945e85a19))
* **tui:** filter popover, modified marker, responsive help, scroll-into-view ([dbc6f8a](https://github.com/TitusKirch/envprism/commit/dbc6f8ac3057257bef8e069fa786033e2c7f035b))
* **tui:** focus navigation, inline cell edit, dirty tracking + save ([68e4fd7](https://github.com/TitusKirch/envprism/commit/68e4fd7a7761875e970c3e604403bbb16eaada13))
* **tui:** mouse scrolling, cell padding, tighter row gap + larger fixture ([cff3802](https://github.com/TitusKirch/envprism/commit/cff3802f2dcd7e21a49c29bfa57c11b143dbfef8))
* **tui:** read-only matrix view with sidebar and live filter ([946ffa5](https://github.com/TitusKirch/envprism/commit/946ffa5b8de4d2f9cda40260f369d73e858b6ab4))
* **tui:** row-level icons, focusable section dividers, auto-height popups ([6f3b975](https://github.com/TitusKirch/envprism/commit/6f3b975411b1ab8018ac5750fc380ea150b5d692))
* **tui:** scrollable matrix with row gap and minimum cell width ([25a0edf](https://github.com/TitusKirch/envprism/commit/25a0edf74173dae5a87be94297f8e032899bc697))
* **tui:** sidebar pane + enable toggle + base picker ([f10f912](https://github.com/TitusKirch/envprism/commit/f10f912746bea6270e944b4597774f0b52743a9d))
* **tui:** skip expanded dividers, tone down headers, sync-to-all ([d880e23](https://github.com/TitusKirch/envprism/commit/d880e23b968d4bde0cf63fef7c21fa28b0f929be))
* **tui:** smart default grouping, expand-all, ctrl-t in matrix ([8e2e512](https://github.com/TitusKirch/envprism/commit/8e2e512076b51e75eb7bb5b8f02b3904c4d2f85f))


### Bug Fixes

* **cli:** drop positional from root command ([a076623](https://github.com/TitusKirch/envprism/commit/a076623c428510f9eadfb5f7cc8bb4c69d56841b))
* **core:** rewrite section parsers without ReDoS-prone regexes ([7300ed8](https://github.com/TitusKirch/envprism/commit/7300ed8d0e9f44d59f6d36b5f096c03cbdda3a52))
* **tui:** bun keyword, = via sequence, popup error, throttled refresh ([ae4dba5](https://github.com/TitusKirch/envprism/commit/ae4dba5cb03c991425a1b10ffd70583f0677fef6))
* **tui:** dynamic column widths, transparent cells, resize handling ([3b86b6f](https://github.com/TitusKirch/envprism/commit/3b86b6f4aa41c0cfbf5000b1af9aabae0239d18e))
* **tui:** em-dash placeholder + popup modal for prompts ([84a4f95](https://github.com/TitusKirch/envprism/commit/84a4f957708efc6cf4f227ca775f2f1d9fae66b7))
* **tui:** esc closes popovers, scroll follows arrow navigation ([b6eb7db](https://github.com/TitusKirch/envprism/commit/b6eb7dbe618d7f38695f2674195f7901d591c73b))
* **tui:** filter via input event, recolour header icons + numbers ([4c07f45](https://github.com/TitusKirch/envprism/commit/4c07f453eefc44a47dea839824d6203b9bec53ae))
* **tui:** footer brackets, brighter prompt hint, dim header icons ([9c33972](https://github.com/TitusKirch/envprism/commit/9c339726bdf6d74eea76e083b8774ea51825cbb7))
* **tui:** footer hint splits into action + mode rows so nothing clips ([bee950a](https://github.com/TitusKirch/envprism/commit/bee950ac0482a9f26e516f41c2404e96d67e02dd))
* **tui:** manual prompt input, single deferred scroll ([8964a8e](https://github.com/TitusKirch/envprism/commit/8964a8ecb49ba361c78176c74db9c8aa174f73d3))
* **tui:** multi-coloured section divider, missing surfaced separately ([cf72d64](https://github.com/TitusKirch/envprism/commit/cf72d64a744bba402fef1b1209a9eab94d995a5a))
* **tui:** no key leak into prompt, green user-change marker, sync scroll ([92d7732](https://github.com/TitusKirch/envprism/commit/92d773282ab6e5fd1e9ce74ad9fcfc94f95ec51d))
* **tui:** per-cell coloured icon, key column stays neutral ([5490233](https://github.com/TitusKirch/envprism/commit/54902337ec5396b4346453e6483c60203ecaeede))
* **tui:** prompt hint inline, sidebar colour encodes role only ([780c37b](https://github.com/TitusKirch/envprism/commit/780c37b5bdf5d74c8c43f2eb07d6c85afbbc737f))
* **tui:** scrollbar no longer overlaps matrix border, inputs hide cleanly ([1b5c620](https://github.com/TitusKirch/envprism/commit/1b5c620d4fb8a0be9f974bf92152422296df58c3))
* **tui:** space sidebar markers, structured help, ß alias, true edit table ([dfb06d9](https://github.com/TitusKirch/envprism/commit/dfb06d95a643141d5c7faf51d9080bc1842bd259))
* **tui:** star marks key not cells, single secret binding, 2-col help ([276932c](https://github.com/TitusKirch/envprism/commit/276932cce4f36537fdd2fcba67fd9da157230306))
* **tui:** typeable filter, blue base accent, yellow dirty bullet ([66f6f4b](https://github.com/TitusKirch/envprism/commit/66f6f4bc3af4e0deeb06930fd6499c6862da3142))
