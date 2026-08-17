import * as Blockly from 'blockly';
import * as l10n from '@vscode/l10n';
import { provideVSCodeDesignSystem, vsCodeButton, vsCodeDropdown, vsCodeOption } from "@vscode/webview-ui-toolkit";
import { categoryStyleFor } from './ThemeAdapter';
import { configureBlocklyLocale, installDialogBridge, injectThemedWorkspace } from './blocklyBootstrap';
import { CodeFactory } from './codegen/core/CodeFactory';
import { isRuntimeSupported, listSupportedRuntimes } from './codegen/core/generatorRegistry';
import { setCommentAnnotation } from './codegen/core/commentAnnotation';
import { initTypedVariableModal, initVariableDeclareCategory, initConstantCategory, initArrayCategory, initWorkspacePlugins, CPP_VARIABLE_TYPES, ThemedMinimap } from './plugins';
import { initCppProcedureFlyout } from './custom-blocks/cppProcedureBlocks';
// The `hat_event_style` extension, `field_param_input`, and the rest of the
// catalog-block field surface are registered by ./plugins (→ ./blockFields).

// ── i18n bootstrap (must happen before any Blockly block defs or UI) ───────
const locale = configureBlocklyLocale();

// Register VSCode UI Toolkit components
provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeDropdown(), vsCodeOption());

interface EnvInfo { name: string; platform?: string; board?: string; framework?: string; }
interface DocLink { label: string; url: string }
interface DocGroup { title: string; links: DocLink[] }

let catalogDocs: DocGroup[] = [];

function titleCase(s: string): string {
    return s.replace(/(^|[-_ ])(\w)/g, (_, sep, c) =>
        (sep === '-' || sep === '_' ? ' ' : sep) + c.toUpperCase());
}

// Acquire VSCode API for messaging
const vscode = acquireVsCodeApi();

// Route Blockly's window.open / dialogs through the host (webviews block both).
const dialogBridge = installDialogBridge(vscode);

document.addEventListener("DOMContentLoaded", () => {
    const blocklyDiv = document.getElementById('blocklyDiv');
    if (!blocklyDiv) {
        console.error("blocklyDiv not found");
        return;
    }

    // Start with an empty category toolbox; it's populated dynamically once the
    // board context arrives. (Injecting without one would make later
    // updateToolbox() calls fail.)
    const { workspace, themeAdapter } = injectThemedWorkspace(blocklyDiv);

    // Load block message dictionaries from JSON (injected by the host).
    // Must happen BEFORE plugin init: typed-variable-modal pre-renders its
    // DOM at init() time reading from Blockly.Msg, so the translations must
    // already be present. We also pass them explicitly via the plugin's
    // optMessages constructor parameter (its designed i18n API).
    const blockMsgEnEl = document.getElementById('block-messages-en');
    const blockMsgLocaleEl = document.getElementById('block-messages-locale');
    const blockMsgEn: Record<string, string> = blockMsgEnEl ? JSON.parse(blockMsgEnEl.textContent || '{}') : {};
    const blockMsgLocale: Record<string, string> = blockMsgLocaleEl ? JSON.parse(blockMsgLocaleEl.textContent || '{}') : {};
    Object.assign(Blockly.Msg, blockMsgEn);
    Object.assign(Blockly.Msg, blockMsgLocale);

    const mergedBlockMessages = { ...blockMsgEn, ...blockMsgLocale };
    initTypedVariableModal(workspace, CPP_VARIABLE_TYPES, mergedBlockMessages);
    initVariableDeclareCategory(workspace);
    initConstantCategory(workspace);
    initArrayCategory(workspace);
    initWorkspacePlugins(workspace);
    initCppProcedureFlyout(workspace);

    const translateCategory = (key: string): string => {
        const CATEGORY_NAMES: Record<string, () => string> = {
            'Logic': () => l10n.t('Logic'),
            'Loops': () => l10n.t('Loops'),
            'Math': () => l10n.t('Math'),
            'Text': () => l10n.t('Text'),
            'Constants': () => l10n.t('Constants'),
            'Variables': () => l10n.t('Variables'),
            'Arrays': () => l10n.t('Arrays'),
            'Lists': () => l10n.t('Lists'),
            'Functions': () => l10n.t('Functions'),
            'Code': () => l10n.t('Code'),
        };
        return CATEGORY_NAMES[key]?.() ?? key;
    };

    const codeFactory = new CodeFactory();
    codeFactory.setCategoryTranslator(translateCategory);

    const emptyState = document.getElementById('emptyState');
    const emptyTitle = emptyState?.querySelector('.title') as HTMLElement | null;
    const emptyHint = emptyState?.querySelector('.hint') as HTMLElement | null;
    const emptyAction = document.getElementById('emptyAction');
    if (emptyAction) emptyAction.textContent = l10n.t('Select framework…');

    // Frameworks offerable as a manual fallback, derived from the supported
    // runtimes (single source of truth) — no separate list to maintain.
    const fallbackFrameworks = () =>
        [...new Set(listSupportedRuntimes().map(r => r.split(':')[0]))];
    const envSelect = document.getElementById('envSelect') as HTMLElement & { value?: string };
    const envLabel = document.getElementById('envLabel');
    const secondaryFileCheck = document.getElementById('secondaryFileCheck') as HTMLInputElement | null;
    const generateBtn = document.getElementById('generateBtn') as (HTMLElement & { disabled?: boolean; appearance?: string }) | null;
    const genCaret = document.getElementById('genCaret');
    const genMenu = document.getElementById('genMenu') as HTMLElement | null;
    const autoGenCheck = document.getElementById('autoGenCheck') as HTMLInputElement | null;
    const docsBtn = document.getElementById('docsBtn');

    // Reference docs are contextual to the loaded catalog: actionable with a count when
    // present, dimmed (aria-disabled) with an explanatory tooltip when blocks expose none.
    // Tooltip text is driven through data-tooltip (see the custom tooltip handler below).
    const updateDocsButton = () => {
        if (!docsBtn) return;
        const n = catalogDocs.length;
        docsBtn.setAttribute('aria-disabled', n === 0 ? 'true' : 'false');
        const tip = n === 0
            ? l10n.t('No reference documentation for the current blocks')
            : n === 1
                ? l10n.t('Open reference documentation (1 component)')
                : l10n.t('Open reference documentation ({0} components)', String(n));
        docsBtn.setAttribute('aria-label', tip);
        docsBtn.setAttribute('data-tooltip', tip);
    };

    // Custom tooltip for toolbar controls. Native `title`/SVG <title> are unreliable
    // through the toolkit's shadow DOM and don't cover the whole control; this single
    // delegated handler reads `data-tooltip` and works for every toolbar button.
    // Event retargeting at the shadow boundary means ev.target resolves to the host
    // <vscode-button>, so closest('[data-tooltip]') finds the attribute regardless.
    const tooltipEl = document.createElement('div');
    tooltipEl.id = 'tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltipEl);

    let tooltipTarget: Element | null = null;
    let tooltipTimer = 0;

    const hideTooltip = () => {
        if (tooltipTimer) { clearTimeout(tooltipTimer); tooltipTimer = 0; }
        tooltipEl.classList.remove('visible');
        tooltipTarget = null;
    };

    const placeTooltip = (target: Element) => {
        const text = target.getAttribute('data-tooltip');
        if (!text) return;
        tooltipEl.textContent = text;
        tooltipEl.classList.add('visible');
        const r = target.getBoundingClientRect();
        const t = tooltipEl.getBoundingClientRect();
        let left = r.left + r.width / 2 - t.width / 2;
        left = Math.max(4, Math.min(left, window.innerWidth - t.width - 4));
        let top = r.bottom + 4;
        if (top + t.height > window.innerHeight - 4) top = r.top - t.height - 4;
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
    };

    document.addEventListener('mouseover', (ev) => {
        const target = (ev.target as Element | null)?.closest('[data-tooltip]') ?? null;
        if (!target || target === tooltipTarget) return;
        hideTooltip();
        tooltipTarget = target;
        tooltipTimer = window.setTimeout(() => {
            if (tooltipTarget === target) placeTooltip(target);
        }, 500);
    });
    document.addEventListener('mouseout', (ev) => {
        if (!tooltipTarget) return;
        // Ignore moves that stay within the same control (child/shadow transitions);
        // relatedTarget is retargeted to the host at the shadow boundary.
        const related = ev.relatedTarget as Node | null;
        if (related && tooltipTarget.contains(related)) return;
        hideTooltip();
    });
    document.addEventListener('mousedown', hideTooltip);

    // The split control is always visible: the body always generates on demand,
    // the caret menu toggles auto mode. In auto mode the body is de-emphasized.
    const updateGenControl = () => {
        if (autoGenCheck) autoGenCheck.checked = autoGenerate;
        if (!generateBtn) return;
        generateBtn.disabled = !runtimeReady;
        generateBtn.appearance = autoGenerate ? 'secondary' : 'primary';
        generateBtn.setAttribute('data-tooltip', autoGenerate
            ? l10n.t('Regenerate code now (auto-generation is on)')
            : l10n.t('Generate code now'));
    };

    const closeGenMenu = () => { if (genMenu) genMenu.hidden = true; };

    const showGenerationFeedback = (ok: boolean, error?: string) => {
        if (!generateBtn) return;
        // In auto mode generation runs on every change — don't flash success each time.
        if (autoGenerate && ok) return;

        const origText = generateBtn.textContent;
        if (ok) {
            generateBtn.textContent = l10n.t('Generated ✓');
        } else {
            generateBtn.textContent = error ? l10n.t('Error: {0}', error) : l10n.t('Generation failed');
        }
        setTimeout(() => {
            generateBtn!.textContent = origText;
            updateGenControl();
        }, ok ? 1500 : 4000);
    };

    // Show a full-area notice instead of the toolbox (no board / no framework / unsupported runtime).
    // The "pick framework" action is offered only when a manual fallback can resolve the state.
    const showBlocked = (title: string, hint: string, canPickFramework = false) => {
        if (emptyTitle) emptyTitle.textContent = title;
        if (emptyHint) emptyHint.textContent = hint;
        emptyAction?.classList.toggle('visible', canPickFramework);
        emptyState?.classList.add('visible');
        runtimeReady = false;
        updateGenControl();
        workspace.updateToolbox({ kind: 'categoryToolbox', contents: [] });
    };

    let autoGenerate = true;
    let runtimeReady = false;
    let minimap: ThemedMinimap | null = null;
    let isSecondaryFile = false;

    // A "secondary file" (see secondaryFileCheck below) must not contribute its
    // own setup()/loop() — the entry-point blocks it would otherwise feed are
    // instead greyed out in place (Blockly's own disabled-block rendering) and
    // excluded from code generation, rather than erroring or hiding the canvas.
    const SECONDARY_DISABLE_REASON = 'secondary-file';

    // Declaration-only blocks: stackable (so they can also be dropped inside a
    // function for a local declaration) but, at the top level, they only ever
    // write into decl_var_/etc. and emit no inline code — never loop() content,
    // regardless of secondary-file status, so they're exempt below.
    const DECLARATION_ONLY_BLOCK_TYPES = new Set(['declare_variable', 'declare_constant', 'array_declare']);

    // Every block that would land in setup() or loop(): a `code_setup`
    // container (whichever zone it routes to — see sectionRouters.ts), or a
    // plain top-level statement stack (identified by having a previousConnection,
    // the same shape trait that lets Blockly chain a statement under another —
    // hat-style blocks like code_setup/code_includes/code_declaration and
    // procedure definitions never have one, so they're naturally excluded).
    const collectEntryPointBlocks = (): Blockly.Block[] => {
        const blocks: Blockly.Block[] = [];
        for (const top of workspace.getTopBlocks(false)) {
            if (top.type === 'code_setup') {
                blocks.push(top);
                continue;
            }
            if (top.previousConnection) {
                for (let b: Blockly.Block | null = top; b; b = b.getNextBlock()) {
                    if (DECLARATION_ONLY_BLOCK_TYPES.has(b.type)) continue;
                    blocks.push(b);
                }
            }
        }
        return blocks;
    };

    // Re-applies the grey-out to match the current isSecondaryFile + block tree.
    // Wrapped in Events.disable() so this programmatic mutation doesn't re-enter
    // the change listener below (mirrors the 'update' case's load pattern).
    // Events.disable()/enable() is a plain boolean, not a ref-counted stack, so
    // this only touches it when events are currently enabled — safe to call
    // from inside another disabled-events block (e.g. the 'update' case) too.
    const applySecondaryDisabling = () => {
        const wasEnabled = Blockly.Events.isEnabled();
        if (wasEnabled) Blockly.Events.disable();
        try {
            const entryBlocks = new Set(isSecondaryFile ? collectEntryPointBlocks() : []);
            for (const block of workspace.getAllBlocks(false)) {
                const disable = entryBlocks.has(block);
                block.setDisabledReason(disable, SECONDARY_DISABLE_REASON);
                block.setWarningText(
                    disable
                        ? l10n.t('This block is part of a "Secondary file" and will not be included in the generated code (secondary files don\'t have their own setup()/loop()).')
                        : null,
                    SECONDARY_DISABLE_REASON
                );
            }
        } finally {
            if (wasEnabled) Blockly.Events.enable();
        }
    };

    secondaryFileCheck?.addEventListener('change', () => {
        isSecondaryFile = !!secondaryFileCheck.checked;
        applySecondaryDisabling();
        if (runtimeReady) generateNow();
    });

    let suppressEnvEvent = false;
    if (envSelect) {
        envSelect.addEventListener('change', () => {
            if (suppressEnvEvent) return;
            const env = (envSelect as any).value as string;
            if (env) vscode.postMessage({ type: 'select_env', env });
        });
    }

    const LANGUAGE_CATEGORIES = [
        {
            kind: 'category', _key: 'Logic', name: translateCategory('Logic'), categorystyle: categoryStyleFor('Logic'),
            contents: [
                { kind: 'block', type: 'controls_if' },
                { kind: 'block', type: 'controls_switch_case' },
                { kind: 'block', type: 'logic_compare' },
                { kind: 'block', type: 'logic_operation' },
                { kind: 'block', type: 'logic_negate' },
                { kind: 'block', type: 'logic_boolean' },
                { kind: 'block', type: 'logic_ternary' },
            ]
        },
        {
            kind: 'category', _key: 'Loops', name: translateCategory('Loops'), categorystyle: categoryStyleFor('Loops'),
            contents: [
                { kind: 'block', type: 'controls_repeat_ext' },
                { kind: 'block', type: 'controls_whileUntil' },
                { kind: 'block', type: 'controls_for' },
                { kind: 'block', type: 'controls_doWhile' },
                { kind: 'block', type: 'controls_flow_statements' },
            ]
        },
        {
            kind: 'category', _key: 'Math', name: translateCategory('Math'), categorystyle: categoryStyleFor('Math'),
            contents: [
                { kind: 'block', type: 'math_number' },
                { kind: 'block', type: 'math_arithmetic' },
                { kind: 'block', type: 'math_modulo' },
                { kind: 'block', type: 'math_single' },
                { kind: 'block', type: 'math_trig' },
                { kind: 'block', type: 'math_constant' },
                { kind: 'block', type: 'math_round' },
                { kind: 'block', type: 'math_number_property' },
                { kind: 'block', type: 'bitwise_operation' },
                { kind: 'block', type: 'bitwise_not' },
                { kind: 'block', type: 'type_cast' },
            ]
        },
        {
            kind: 'category', _key: 'Text', name: translateCategory('Text'), categorystyle: categoryStyleFor('Text'),
            contents: [
                { kind: 'block', type: 'text' },
                { kind: 'block', type: 'symbol_literal' },
                { kind: 'block', type: 'text_join' },
                { kind: 'block', type: 'text_append' },
                { kind: 'block', type: 'text_length' },
                { kind: 'block', type: 'text_isEmpty' },
                { kind: 'block', type: 'text_indexOf' },
                { kind: 'block', type: 'text_charAt' },
                { kind: 'block', type: 'text_getSubstring' },
                { kind: 'block', type: 'text_changeCase' },
                { kind: 'block', type: 'text_trim' },
            ]
        },
        {
            // "Create constant…" button (see initConstantCategory) tags the new
            // variable with CONSTANT_VAR_TYPE, so it only shows up here — never
            // mixed in with, or confused for, regular Variables.
            kind: 'category', _key: 'Constants', name: translateCategory('Constants'), categorystyle: categoryStyleFor('Constants'),
            custom: 'CONSTANT_CATEGORY',
        },
        {
            // Name-only creation (Blockly's classic flow): the type is chosen
            // later, at the point of use, by the "declare variable" block
            // appended to this same flyout (see initVariableDeclareCategory),
            // which also lets it be changed — unlike the old create-time type
            // picker.
            kind: 'category', _key: 'Variables', name: translateCategory('Variables'), categorystyle: categoryStyleFor('Variables'),
            custom: 'VARIABLE_WITH_DECLARE',
        },
        {
            // "Create array…" button (see initArrayCategory) tags the new
            // variable with ARRAY_VAR_TYPE, so it only shows up here — never
            // mixed in with, or confused for, regular Variables/Constants.
            kind: 'category', _key: 'Arrays', name: translateCategory('Arrays'), categorystyle: categoryStyleFor('Arrays'),
            custom: 'ARRAY_CATEGORY',
        },
        {
            kind: 'category', _key: 'Functions', name: translateCategory('Functions'), categorystyle: categoryStyleFor('Functions'),
            custom: 'CPP_PROCEDURE',
        },
        {
            kind: 'category', _key: 'Code', name: translateCategory('Code'), categorystyle: categoryStyleFor('Text'),
            contents: [
                { kind: 'block', type: 'code_declaration' },
                { kind: 'block', type: 'code_statement' },
                { kind: 'block', type: 'code_expression' },
            ]
        },
    ];

    // Toolbox for the `arduino:python` runtime. Uses Blockly's stock Python L1
    // blocks (Lists instead of C++ Arrays, no do-while, text_print) and the
    // built-in VARIABLE/PROCEDURE flyouts (Python procedures are stock Blockly,
    // not the typed C++ ones). The shared `controls_switch_case` block is reused
    // (its Python generator emits match/case). The `code_*` family is merged in
    // from the arduino:python catalog (catalogs/arduino/python/code.yaml) via the
    // name-matched "Code" category below.
    const PYTHON_LANGUAGE_CATEGORIES = [
        {
            kind: 'category', _key: 'Logic', name: translateCategory('Logic'), categorystyle: categoryStyleFor('Logic'),
            contents: [
                { kind: 'block', type: 'controls_if' },
                { kind: 'block', type: 'controls_switch_case' },
                { kind: 'block', type: 'logic_compare' },
                { kind: 'block', type: 'logic_operation' },
                { kind: 'block', type: 'logic_negate' },
                { kind: 'block', type: 'logic_boolean' },
                { kind: 'block', type: 'logic_null' },
                { kind: 'block', type: 'logic_ternary' },
            ]
        },
        {
            kind: 'category', _key: 'Loops', name: translateCategory('Loops'), categorystyle: categoryStyleFor('Loops'),
            contents: [
                { kind: 'block', type: 'controls_repeat_ext' },
                { kind: 'block', type: 'controls_whileUntil' },
                { kind: 'block', type: 'controls_for' },
                { kind: 'block', type: 'controls_flow_statements' },
            ]
        },
        {
            kind: 'category', _key: 'Math', name: translateCategory('Math'), categorystyle: categoryStyleFor('Math'),
            contents: [
                { kind: 'block', type: 'math_number' },
                { kind: 'block', type: 'math_arithmetic' },
                { kind: 'block', type: 'math_single' },
                { kind: 'block', type: 'math_trig' },
                { kind: 'block', type: 'math_constant' },
                { kind: 'block', type: 'math_round' },
                { kind: 'block', type: 'math_modulo' },
                { kind: 'block', type: 'math_constrain' },
                { kind: 'block', type: 'math_random_int' },
                { kind: 'block', type: 'math_random_float' },
                { kind: 'block', type: 'math_number_property' },
            ]
        },
        {
            kind: 'category', _key: 'Text', name: translateCategory('Text'), categorystyle: categoryStyleFor('Text'),
            contents: [
                { kind: 'block', type: 'text' },
                { kind: 'block', type: 'text_join' },
                { kind: 'block', type: 'text_length' },
                { kind: 'block', type: 'text_isEmpty' },
                { kind: 'block', type: 'text_indexOf' },
                { kind: 'block', type: 'text_charAt' },
                { kind: 'block', type: 'text_getSubstring' },
                { kind: 'block', type: 'text_changeCase' },
                { kind: 'block', type: 'text_trim' },
                { kind: 'block', type: 'text_print' },
            ]
        },
        {
            kind: 'category', _key: 'Lists', name: translateCategory('Lists'), categorystyle: categoryStyleFor('Arrays'),
            contents: [
                { kind: 'block', type: 'lists_create_with' },
                { kind: 'block', type: 'lists_repeat' },
                { kind: 'block', type: 'lists_length' },
                { kind: 'block', type: 'lists_isEmpty' },
                { kind: 'block', type: 'lists_indexOf' },
                { kind: 'block', type: 'lists_getIndex' },
                { kind: 'block', type: 'lists_setIndex' },
            ]
        },
        {
            kind: 'category', _key: 'Variables', name: translateCategory('Variables'), categorystyle: categoryStyleFor('Variables'),
            custom: 'VARIABLE',
        },
        {
            kind: 'category', _key: 'Functions', name: translateCategory('Functions'), categorystyle: categoryStyleFor('Functions'),
            custom: 'PROCEDURE',
        },
        {
            // Empty contents: filled by the arduino:python catalog's Code family
            // through the name-matched category merge in init_catalog.
            kind: 'category', _key: 'Code', name: translateCategory('Code'), categorystyle: categoryStyleFor('Text'),
            contents: [] as Array<{ kind: string; type: string }>,
        },
    ];

    function populateEnvSelector(envs: EnvInfo[], selected?: string) {
        if (!envSelect || !envLabel) return;
        const show = envs.length > 0;
        envSelect.style.display = show ? '' : 'none';
        envLabel.style.display = show ? '' : 'none';
        if (!show) return;

        suppressEnvEvent = true;
        envSelect.innerHTML = '';
        for (const env of envs) {
            const opt = document.createElement('vscode-option');
            opt.setAttribute('value', env.name);
            const label = env.name || l10n.t('Default');
            const detail = env.board ? ` (${env.board})` : env.platform ? ` (${env.platform})` : '';
            opt.textContent = label + detail;
            envSelect.appendChild(opt);
        }
        if (selected !== undefined) (envSelect as any).value = selected;
        suppressEnvEvent = false;
    }

    // Notify extension that webview is ready
    vscode.postMessage({ type: 'ready' });

    let lastSentState = '';

    // Listen for messages from the extension host
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'init_catalog': {
                const { hasBoard, framework, runtime } = message;
                populateEnvSelector(message.envs ?? [], message.selectedEnv);

                if (!hasBoard) {
                    showBlocked(
                        l10n.t('No board detected'),
                        l10n.t('Open this file inside a project containing a platformio.ini, sketch.yaml, or app.yaml to load the blocks compatible with your board — or select a framework manually below.'),
                        true
                    );
                    break;
                }
                if (!framework || !runtime) {
                    const isArduino = message.configType === 'arduino';
                    showBlocked(
                        l10n.t('No framework declared'),
                        isArduino
                            ? l10n.t('This profile\'s FQBN does not specify a recognized framework. Ensure the fqbn field is set correctly in sketch.yaml.')
                            : l10n.t('This environment does not set "framework" in platformio.ini, so no code can be generated. Add a framework (e.g. framework = arduino).')
                    );
                    break;
                }
                if (!isRuntimeSupported(runtime) || !codeFactory.setRuntime(runtime)) {
                    showBlocked(
                        l10n.t('Framework "{0}" not yet supported', framework),
                        l10n.t('Block generation for the "{0}" runtime is not implemented yet. Currently supported: arduino:cpp, arduino:python.', runtime)
                    );
                    break;
                }

                // Supported runtime: show the toolbox and enable generation.
                emptyState?.classList.remove('visible');
                runtimeReady = true;
                updateGenControl();

                codeFactory.loadCatalogEntries(message.entries ?? [], locale);

                catalogDocs = [];
                for (const entry of (message.entries ?? [])) {
                    if (!entry.docs || Object.keys(entry.docs).length === 0) continue;
                    const desc = entry.description;
                    const title = typeof desc === 'object' && desc !== null
                        ? ((desc as Record<string, string>)[locale] ?? (desc as Record<string, string>)['en'] ?? titleCase(entry.id))
                        : (typeof desc === 'string' ? desc : titleCase(entry.id));
                    catalogDocs.push({
                        title,
                        links: Object.entries(entry.docs as Record<string, string>).map(([key, url]) => ({
                            label: titleCase(key), url
                        })),
                    });
                }
                updateDocsButton();

                // Merge catalog categories into language categories that share a
                // name (e.g. a catalog "Code" folds into the built-in "Code"
                // instead of rendering a duplicate). Catalog categories with no
                // language match are appended standalone.
                // loadCatalogEntries registers catalog category labels
                // with ThemeAdapter (via ensureCategoryRegistered), so a
                // single applyTheme rebuilds all style keys before the
                // toolbox references them.
                themeAdapter.applyTheme();

                const catalogCategories = codeFactory.getCatalogToolboxCategories();
                const merged = new Set<string>();
                const baseCategories = runtime === 'arduino:python' ? PYTHON_LANGUAGE_CATEGORIES : LANGUAGE_CATEGORIES;
                const languageCategories = baseCategories.map(cat => {
                    const key = (cat as any)._key as string;
                    const match = catalogCategories.find(c => c._key === key && Array.isArray(c.contents));
                    if (!match || !Array.isArray((cat as any).contents)) return cat;
                    merged.add(key);
                    return { ...cat, contents: [...(cat as any).contents, ...match.contents] };
                });
                const standalone = catalogCategories.filter(c => !merged.has(c._key));

                workspace.updateToolbox({
                    kind: 'categoryToolbox',
                    contents: [
                        { kind: 'search' },
                        ...languageCategories,
                        ...standalone,
                    ]
                });

                break;
            }
            case 'set_mode':
                autoGenerate = message.autoGenerate !== false;
                updateGenControl();
                break;
            case 'theme_changed':
                themeAdapter.onThemeChanged();
                if (minimap) minimap.applyDarkTheme(workspace);
                break;
            case 'set_annotate': {
                const changed = setCommentAnnotation(message.annotate !== false);
                // Re-emit so the source reflects the new setting, but only when the
                // value actually changed (not on the initial push at open) and only
                // when auto-generation is on, mirroring the change listener.
                if (changed && autoGenerate && runtimeReady) generateNow();
                break;
            }
            case 'set_minimap':
                if (message.show && !minimap) {
                    minimap = new ThemedMinimap(workspace);
                    minimap.init();
                    minimap.applyDarkTheme(workspace);
                } else if (!message.show && minimap) {
                    minimap.dispose();
                    minimap = null;
                }
                break;
            case 'generation_result':
                showGenerationFeedback(message.ok, message.error);
                break;
            case 'dialog_result': {
                dialogBridge.handleDialogResult(message.id, message.value);
                break;
            }
            case 'update':
                // Update workspace from XML/JSON
                if (message.state) {
                    const incomingState = JSON.stringify(message.state);
                    if (incomingState === lastSentState) {
                        return; // Ignore updates that we just sent
                    }
                    // Not part of Blockly's own serialization: read separately
                    // (Blockly.serialization.workspaces.load ignores unknown keys).
                    isSecondaryFile = !!(message.state as { secondaryFile?: boolean }).secondaryFile;
                    if (secondaryFileCheck) secondaryFileCheck.checked = isSecondaryFile;
                    Blockly.Events.disable();
                    try {
                        workspace.clear();
                        Blockly.serialization.workspaces.load(message.state, workspace);
                        applySecondaryDisabling();
                    } catch (err) {
                        const text = err instanceof Error ? err.message : String(err);
                        console.error('[blocks] Failed to load workspace:', text);
                        vscode.postMessage({ type: 'load_error', error: text });
                    } finally {
                        Blockly.Events.enable();
                    }
                }
                break;
        }
    });

    // Blockly's own serialization plus the fields it doesn't know about.
    const buildState = () => ({ ...Blockly.serialization.workspaces.save(workspace), secondaryFile: isSecondaryFile });

    // Generate code from the current workspace, tolerating generator errors.
    // A "secondary file"'s entry-point blocks are greyed out (see
    // applySecondaryDisabling) and excluded by Blockly's own codegen — there is
    // nothing left to reject here, generation always proceeds.
    const generate = (): string => {
        try {
            return codeFactory.generateCode(workspace, { secondary: isSecondaryFile });
        } catch (err) {
            console.error('[codegen] generation failed', err);
            return '';
        }
    };

    // Send block state + generated code to the host on workspace changes.
    workspace.addChangeListener((e) => {
        if (e.isUiEvent) return;
        if (workspace.isDragging()) return;

        // Keep newly dropped/moved entry-point blocks greyed out in real time.
        applySecondaryDisabling();

        const state = buildState();
        const stateStr = JSON.stringify(state);

        if (stateStr !== lastSentState) {
            lastSentState = stateStr;
            const msg: any = { type: 'change', state };
            if (autoGenerate) msg.code = generate();
            vscode.postMessage(msg);
        }
    });

    // Explicit regeneration via the split-button body (always sends code).
    const generateNow = () => {
        const state = buildState();
        lastSentState = JSON.stringify(state);
        vscode.postMessage({ type: 'change', state, code: generate() });
    };
    generateBtn?.addEventListener('click', generateNow);

    // Caret opens the one-item options menu.
    genCaret?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (genMenu) genMenu.hidden = !genMenu.hidden;
    });

    // Toggling auto mode persists the global setting (host echoes set_mode back).
    autoGenCheck?.addEventListener('change', () => {
        const enabled = !!autoGenCheck.checked;
        autoGenerate = enabled;
        vscode.postMessage({ type: 'set_generate_mode', autoGenerate: enabled });
        closeGenMenu();
        updateGenControl();
        // Switching back to auto: regenerate now so the file matches current blocks.
        if (enabled && runtimeReady) generateNow();
    });

    // Dismiss the menu on outside click or Escape.
    document.addEventListener('click', (ev) => {
        if (!genMenu || genMenu.hidden) return;
        const target = ev.target as Node;
        if (genMenu.contains(target) || genCaret?.contains(target)) return;
        closeGenMenu();
    });
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') closeGenMenu();
    });

    docsBtn?.addEventListener('click', () => {
        if (catalogDocs.length > 0) {
            vscode.postMessage({ type: 'show_docs', docs: catalogDocs });
        }
    });

    emptyAction?.addEventListener('click', () => {
        vscode.postMessage({ type: 'pick_fallback_framework', frameworks: fallbackFrameworks() });
    });
});
