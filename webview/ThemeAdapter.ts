import * as Blockly from 'blockly';
5
/**
 * Centralised VS Code → Blockly theme bridge.
 *
 * Every colour used by L1 blocks and toolbox categories is defined here.
 * Custom blocks reference these via `style: 'logic_blocks'` (JSON defs) or
 * `this.setStyle('logic_blocks')` (imperative defs). Toolbox categories use
 * `categorystyle: 'logic_category'`.
 *
 * Changing a colour here propagates everywhere — no hardcoded hex in blocks
 * or toolbox definitions.
 */

// ── Built-in palette defaults ───────────────────────────────────────────────
// Keyed by the toolbox category label (case-sensitive).

const BUILTIN_DEFAULTS: Record<string, string> = {
    'Logic':     '#569CD6',   // VS Code keyword blue
    'Loops':     '#C586C0',   // VS Code control-flow purple
    'Math':      '#B5CEA8',   // VS Code number-literal green
    'Text':      '#CE9178',   // VS Code string-literal orange
    'Constants': '#D7BA7D',   // VS Code readonly/constant gold
    'Variables': '#4DB6D4',   // Deeper cyan (readable white text)
    'Arrays':    '#4EC9B0',   // VS Code type-annotation teal
    'Functions': '#B8A848',   // Deeper olive-yellow (readable white text)
};

/** Fallback colour for catalog-defined categories with no explicit colour. */
const CATALOG_DEFAULT_COLOUR = '#607D8B';

// ── Colour helpers ──────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
    ];
}

function rgbToHex(r: number, g: number, b: number): string {
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    return '#' + [clamp(r), clamp(g), clamp(b)]
        .map(v => v.toString(16).padStart(2, '0'))
        .join('');
}

function darken(hex: string, amount = 0.25): string {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function lighten(hex: string, amount = 0.2): string {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(
        r + (255 - r) * amount,
        g + (255 - g) * amount,
        b + (255 - b) * amount,
    );
}

function makeBlockStyle(primary: string): Blockly.Theme.BlockStyle {
    return {
        colourPrimary:   primary,
        colourSecondary: darken(primary, 0.25),
        colourTertiary:  lighten(primary, 0.2),
        hat: '',
    };
}

/**
 * Map our category labels to the Blockly Classic style keys.
 * Built-in Blockly blocks have these names hardcoded (e.g. controls_if
 * uses 'logic_blocks', variables_get uses 'variable_blocks').
 * We MUST define the same keys in our theme, or the blocks fall back
 * to Classic's default colours.
 */
const BLOCKLY_STYLE_KEYS: Record<string, { block: string; category: string }> = {
    'Logic':     { block: 'logic_blocks',            category: 'logic_category' },
    'Loops':     { block: 'loop_blocks',             category: 'loop_category' },
    'Math':      { block: 'math_blocks',             category: 'math_category' },
    'Text':      { block: 'text_blocks',             category: 'text_category' },
    'Variables': { block: 'variable_blocks',         category: 'variable_category' },
    'Arrays':    { block: 'variable_blocks',         category: 'array_category' },
    'Functions': { block: 'procedure_blocks',        category: 'procedure_category' },
};

/** Sanitise a category label into a valid Blockly style key (for catalog categories). */
function styleKey(label: string): string {
    return label.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

// ── Colour resolution ───────────────────────────────────────────────────────

let catalogColors: Record<string, string> = {};
/** Category labels discovered from catalog YAML — need theme styles too. */
let catalogLabels = new Set<string>();

/**
 * Resolve the colour for a category label.
 * Priority: catalog YAML → built-in default → fallback.
 */
export function resolveColor(categoryLabel: string): string {
    const top = categoryLabel.split('::')[0];

    if (catalogColors[categoryLabel]) return catalogColors[categoryLabel];
    if (top !== categoryLabel && catalogColors[top]) return catalogColors[top];

    if (BUILTIN_DEFAULTS[categoryLabel]) return BUILTIN_DEFAULTS[categoryLabel];
    if (top !== categoryLabel && BUILTIN_DEFAULTS[top]) return BUILTIN_DEFAULTS[top];

    return CATALOG_DEFAULT_COLOUR;
}

/** Register a catalog-declared category colour (from YAML `colour` field). */
export function setCatalogColor(categoryLabel: string, colour: string): void {
    const top = categoryLabel.split('::')[0];
    catalogColors[top] = colour;
}

/** Return the Blockly block style name for a category label. */
export function blockStyleFor(categoryLabel: string): string {
    return BLOCKLY_STYLE_KEYS[categoryLabel]?.block
        ?? styleKey(categoryLabel) + '_blocks';
}

/** Return the Blockly category style name for a category label. */
export function categoryStyleFor(categoryLabel: string): string {
    return BLOCKLY_STYLE_KEYS[categoryLabel]?.category
        ?? styleKey(categoryLabel) + '_category';
}

/**
 * Register a catalog category label so its style key is included in
 * the next theme rebuild. Idempotent — safe to call repeatedly.
 */
export function ensureCategoryRegistered(label: string): void {
    catalogLabels.add(label);
}

/** Clear catalog-sourced labels and colours. Called at the start of each catalog reload. */
export function resetCatalogState(): void {
    catalogLabels = new Set<string>();
    catalogColors = {};
}

// ── Theme builder ───────────────────────────────────────────────────────────

/**
 * Build blockStyles and categoryStyles for all known categories:
 * built-in defaults + any user overrides (which may include catalog categories).
 */
function buildStyles(): {
    blockStyles: { [key: string]: Blockly.Theme.BlockStyle };
    categoryStyles: { [key: string]: Blockly.Theme.CategoryStyle };
} {
    const blockStyles: { [key: string]: Blockly.Theme.BlockStyle } = {};
    const categoryStyles: { [key: string]: Blockly.Theme.CategoryStyle } = {};

    // Collect all known category labels (built-in + user overrides + catalog)
    const allLabels = new Set<string>([
        ...Object.keys(BUILTIN_DEFAULTS),
        ...Object.keys(catalogColors),
        ...catalogLabels,
    ]);

    for (const label of allLabels) {
        const colour = resolveColor(label);
        blockStyles[blockStyleFor(label)] = makeBlockStyle(colour);
        categoryStyles[categoryStyleFor(label)] = { colour };
    }

    // Blockly's dynamic variable blocks use 'variable_dynamic_blocks' — alias
    // to the same colour as Variables so typed variables match.
    const varColour = resolveColor('Variables');
    blockStyles['variable_dynamic_blocks'] = makeBlockStyle(varColour);

    return { blockStyles, categoryStyles };
}

// ── ThemeAdapter ─────────────────────────────────────────────────────────────

export class ThemeAdapter {
    private workspace: Blockly.WorkspaceSvg | null = null;

    constructor() {}

    public init(workspace: Blockly.WorkspaceSvg) {
        this.workspace = workspace;
        this.applyTheme();
    }

    /** Re-apply the theme. Called by the message handler on `theme_changed`. */
    public onThemeChanged(): void {
        this.applyTheme();
    }

    public applyTheme() {
        if (!this.workspace) return;

        const styles = getComputedStyle(document.body);
        const bg          = styles.getPropertyValue('--vscode-editor-background').trim() || '#1e1e1e';
        const fg          = styles.getPropertyValue('--vscode-editor-foreground').trim() || '#d4d4d4';
        const widgetBg    = styles.getPropertyValue('--vscode-editorWidget-background').trim() || '#252526';
        const widgetBorder= styles.getPropertyValue('--vscode-editorWidget-border').trim() || '#454545';
        const selectionBg = styles.getPropertyValue('--vscode-editor-selectionBackground').trim() || '#264f78';
        const buttonBg    = styles.getPropertyValue('--vscode-button-background').trim() || selectionBg;
        const buttonFg    = styles.getPropertyValue('--vscode-button-foreground').trim() || '#ffffff';
        const buttonHover = styles.getPropertyValue('--vscode-button-hoverBackground').trim() || buttonBg;
        const buttonBorder= styles.getPropertyValue('--vscode-button-border').trim() || buttonBg;
        const font        = styles.getPropertyValue('--vscode-font-family').trim() || 'sans-serif';
        const fontSizeRaw = styles.getPropertyValue('--vscode-editor-fontSize').trim()
                         || styles.getPropertyValue('--vscode-font-size').trim();
        const fontSize    = fontSizeRaw ? parseInt(fontSizeRaw, 10) : 12;

        const { blockStyles, categoryStyles } = buildStyles();

        const vscodeTheme = Blockly.Theme.defineTheme('vscodeTheme', {
            // `name` is redundant with the first arg but required by the ITheme type.
            name: 'vscodeTheme',
            base: Blockly.Themes.Classic,
            blockStyles,
            categoryStyles,
            componentStyles: {
                workspaceBackgroundColour: bg,
                toolboxBackgroundColour: widgetBg,
                toolboxForegroundColour: fg,
                flyoutBackgroundColour: widgetBg,
                flyoutForegroundColour: fg,
                flyoutOpacity: 0.9,
                scrollbarColour: '#797979',
                scrollbarOpacity: 0.4,
                insertionMarkerColour: fg,
                insertionMarkerOpacity: 0.3,
                markerColour: fg,
                cursorColour: fg,
            },
            fontStyle: {
                family: font,
                weight: 'normal',
                size: fontSize * 2 / 3,
            }
        });

        this.workspace.setTheme(vscodeTheme);

        let styleTag = document.getElementById('blockly-vscode-theme-styles');
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'blockly-vscode-theme-styles';
            document.head.appendChild(styleTag);
        }

        const inputBg = 'rgba(0,0,0,0.3)';
        const inputBorder = 'rgba(255,255,255,0.3)';
        const btnBg = 'rgba(255,255,255,0.12)';
        const btnHover = 'rgba(255,255,255,0.2)';

        styleTag.innerHTML = `
            /*
             * Override Blockly's hardcoded light-theme CSS.
             *
             * Blockly injects three CSS sources (all in <head>):
             *   1. blockly-common-style  — static rules (.blocklyMenu bg:#fff,
             *      .blocklyMenuItem color:#000, .blocklyTooltipDiv bg:#ffffc7, etc.)
             *   2. blockly-renderer-style-<name> — renderer-specific rules
             *   3. Blockly.Css.register() — plugin CSS (modal, typed-var-modal)
             *
             * Our <style> tag is appended after all of these, so equal-specificity
             * rules here win by source order. We add !important to be safe against
             * inline styles and future Blockly changes.
             *
             * The checkmark in menus uses a sprite PNG (black on transparent).
             * We invert it with CSS filter for dark backgrounds.
             */

            /* ── Menus (context menu, variable dropdown, etc.) ─────── */
            /* Blockly source: .blocklyWidgetDiv .blocklyMenu { background:#fff } */
            .blocklyWidgetDiv .blocklyMenu {
                background: ${widgetBg} !important;
                border: 1px solid ${widgetBorder} !important;
                font-family: ${font} !important;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important;
            }
            /* Blockly source: .blocklyMenuItem { color:#000 } */
            .blocklyMenuItem {
                color: ${fg} !important;
            }
            /* Blockly source: .blocklyMenuItemHighlight { background:rgba(0,0,0,.1) } */
            .blocklyMenuItemHighlight {
                background-color: ${selectionBg} !important;
            }
            /* Blockly source: .blocklyMenuItemDisabled { color:#ccc } */
            .blocklyMenuItemDisabled {
                color: rgba(255,255,255,0.35) !important;
            }
            /* Blockly source: .blocklyMenuSeparator { background-color:#ccc } */
            .blocklyMenuSeparator {
                background-color: ${widgetBorder} !important;
            }
            /* Checkmark sprite is black-on-transparent PNG — invert for dark bg */
            .blocklyMenuItemCheckbox {
                filter: invert(1) !important;
            }

            /* ── DropDownDiv (field editors: dropdown, combobox, etc.) */
            /* Blockly source: .blocklyDropDownDiv { background-color:#fff; border-color:#dadce0 } */
            .blocklyDropDownDiv {
                background-color: ${widgetBg} !important;
                border-color: ${widgetBorder} !important;
                font-family: ${font} !important;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important;
                outline: none !important;
            }
            .blocklyDropDownArrow {
                background-color: ${widgetBg} !important;
                border-color: ${widgetBorder} !important;
            }
            /* Menu inside DropDownDiv inherits bg via "background:inherit" in Blockly */
            .blocklyDropDownDiv .blocklyMenu {
                background: inherit !important;
                border: none !important;
                box-shadow: none !important;
            }

            /* ── Tooltips ──────────────────────────────────────────── */
            /* Blockly source: .blocklyTooltipDiv { font: 9pt sans-serif; background:#ffffc7; color:#000 } */
            .blocklyTooltipDiv {
                background-color: ${widgetBg} !important;
                border: 1px solid ${widgetBorder} !important;
                color: ${fg} !important;
                font: ${fontSize}px ${font} !important;
                opacity: 1 !important;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important;
            }

            /* ── Modal (plugin-modal: .blocklyModalContainer bg:#fff) ─ */
            .blocklyModalOverlay {
                background-color: rgba(0,0,0,0.5) !important;
            }
            .blocklyModalContainer {
                background-color: ${widgetBg} !important;
                border: 1px solid ${widgetBorder} !important;
                color: ${fg} !important;
                font-family: ${font} !important;
                box-shadow: 0 4px 16px rgba(0,0,0,0.5) !important;
            }
            .blocklyModalHeaderTitle {
                color: ${fg} !important;
            }
            /* plugin-modal: .blocklyModalBtn { border:1px solid gray; color:gray } */
            .blocklyModalBtn {
                background-color: ${btnBg} !important;
                color: ${fg} !important;
                border: 1px solid ${widgetBorder} !important;
                font-family: ${font} !important;
                cursor: pointer;
            }
            .blocklyModalBtn:hover {
                background-color: ${btnHover} !important;
            }
            /* plugin-modal: .blocklyModalBtnPrimary { background-color:gray; color:#fff } */
            .blocklyModalBtnPrimary {
                background-color: ${selectionBg} !important;
                color: #fff !important;
                border-color: transparent !important;
            }
            .blocklyModalBtnPrimary:hover {
                filter: brightness(1.2);
            }
            .blocklyModalBtnClose {
                color: ${fg} !important;
                opacity: 0.7;
            }
            .blocklyModalBtnClose:hover {
                opacity: 1;
            }

            /*
             * Typed variable modal layout is handled by inline styles in
             * StyledTypedVariableModal (plugins.ts) because Blockly's
             * WidgetDiv CSS injection prevents reliable stylesheet overrides.
             */

            /* ── Flyout button ("Create typed variable…") ──────────── */
            /*
             * Blockly renders flyout buttons as SVG:
             *   <g class="blocklyFlyoutButton" fill:#888>
             *     <rect class="blocklyFlyoutButtonShadow" fill:#666/>
             *     <rect class="blocklyFlyoutButtonBackground"/>  (inherits group fill)
             *     <text class="blocklyText" fill:#fff/>
             * Drive all of it from VS Code's button theme so it matches
             * native buttons.
             */
            .blocklyFlyoutButton {
                fill: ${buttonBg} !important;
                cursor: pointer;
            }
            .blocklyFlyoutButtonShadow {
                fill: ${buttonBorder} !important;
            }
            @media (hover: hover) {
                .blocklyFlyoutButton:hover {
                    fill: ${buttonHover} !important;
                }
            }
            .blocklyFlyoutButton:active {
                fill: ${buttonHover} !important;
            }
            .blocklyFlyoutButton .blocklyText {
                fill: ${buttonFg} !important;
            }

            /* ── Workspace controls ────────────────────────────────── */
            .blocklyZoom {
                opacity: 0.7;
            }
            .blocklyZoom:hover {
                opacity: 1;
            }
            .blocklyTrash {
                opacity: 0.6;
            }
            .blocklyTrash:hover {
                opacity: 1;
            }

            /* ── Main workspace — no border ────────────────────────── */
            .blocklyMainBackground {
                stroke: none !important;
            }

            /* ── Minimap ───────────────────────────────────────────── */
            .blockly-minimap {
                box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important;
                border: 2px solid ${widgetBorder};
                border-radius: 4px;
                overflow: hidden;
            }
            .blockly-minimap .blocklySvg {
                background-color: ${bg} !important;
            }
            .blockly-minimap .blocklyScrollbarHorizontal,
            .blockly-minimap .blocklyScrollbarVertical {
                display: none !important;
            }

            /* ── Toolbox ───────────────────────────────────────────── */
            .blocklyToolboxCategoryLabel {
                font: ${fontSize}px ${font} !important;
            }
            /* Suppress browser focus outline on toolbox rows */
            .blocklyToolboxCategory:focus,
            .blocklyToolboxCategoryContainer:focus {
                outline: none !important;
            }
            /* Blockly sets the selection background inline (from the
               category colour or defaultBackgroundColour) and hardcodes
               the label to #fff. Override both with VS Code theme tokens
               so selection adapts to dark/light/high-contrast themes. */
            .blocklyToolboxCategory.blocklyToolboxSelected {
                background-color: ${selectionBg} !important;
            }
            .blocklyToolboxSelected .blocklyToolboxCategoryLabel {
                color: ${fg} !important;
            }

            /* ── Collapsible-category expand/collapse icon ────────── */
            /* Replace Blockly's sprite-based triangle (invisible on dark
               backgrounds) with a pure-CSS chevron that inherits the
               foreground colour.  The icon <span> is 16×16 inline-block. */
            .blocklyToolboxCategoryIcon {
                background-image: none !important;
                position: relative;
                width: 12px !important;
                height: 12px !important;
            }
            /* Draw a small chevron via a rotated border-corner */
            .blocklyToolboxCategoryIconClosed::after,
            .blocklyToolboxCategoryIconOpen::after {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                width: 5px;
                height: 5px;
                border-right: 1.5px solid ${fg};
                border-bottom: 1.5px solid ${fg};
                transform-origin: center center;
            }
            .blocklyToolboxCategoryIconClosed::after {
                /* ▸  points right */
                transform: translate(-60%, -50%) rotate(-45deg);
            }
            .blocklyToolboxCategoryIconOpen::after {
                /* ▾  points down */
                transform: translate(-50%, -65%) rotate(45deg);
            }
            /* Brighter on selected row */
            .blocklyToolboxSelected > .blocklyToolboxCategoryIconClosed::after,
            .blocklyToolboxSelected > .blocklyToolboxCategoryIconOpen::after {
                border-color: #fff;
            }

            /* ── Field plugins ────────────────────────────────────── */
            /* Slider (@blockly/field-slider) */
            .fieldSliderContainer {
                background: ${widgetBg};
                width: 110px !important;
                height: 24px !important;
            }
            .fieldSlider::-webkit-slider-runnable-track {
                background: ${widgetBorder} !important;
                height: 6px !important;
            }
            .fieldSlider::-webkit-slider-thumb {
                height: 16px !important;
                width: 16px !important;
                margin-top: -5px !important;
                background: ${buttonBg} !important;
                box-shadow: 0 0 0 2px ${widgetBorder} !important;
            }
            .fieldSlider::-moz-range-track {
                background: ${widgetBorder} !important;
                height: 6px !important;
            }
            .fieldSlider::-moz-range-thumb {
                height: 16px !important;
                width: 16px !important;
                background: ${buttonBg} !important;
                box-shadow: 0 0 0 2px ${widgetBorder} !important;
            }

            /* Bitmap field (@blockly/field-bitmap) */
            .dropdownEditor {
                padding: 0 !important;
            }
            .dropdownEditor.has-buttons {
                margin-bottom: 8px !important;
            }
            .pixelContainer {
                margin: 8px !important;
            }
            .pixelButton {
                border-color: ${widgetBorder} !important;
            }
            .controlButton {
                font-family: var(--vscode-font-family, ${font}) !important;
                font-size: 11px !important;
                color: ${buttonFg} !important;
                background: ${buttonBg} !important;
                border: 1px solid ${buttonBorder} !important;
                border-radius: 3px !important;
                padding: 3px 12px !important;
                cursor: pointer !important;
                margin: 2px 0 !important;
                line-height: 1.4 !important;
            }
            .controlButton:hover {
                background: ${buttonHover} !important;
            }
            .blocklyDropDownContent.contains-bitmap-editor {
                background: ${widgetBg} !important;
            }

            /* HSV colour sliders (@blockly/field-colour-hsv-sliders) */
            .fieldColourSliderContainer {
                color: ${fg} !important;
                font-family: ${font} !important;
                font-size: ${fontSize}px !important;
            }
            .fieldColourSliderContainer hr {
                border-top-color: ${widgetBorder} !important;
            }
            .fieldColourSlider {
                background: transparent !important;
            }
            .fieldColourSlider::-webkit-slider-thumb {
                background: ${widgetBg} !important;
                border: 2px solid ${fg} !important;
                box-shadow: 0 0 0 1px ${widgetBorder} !important;
            }
            .fieldColourSlider::-moz-range-thumb {
                background: ${widgetBg} !important;
                border: 2px solid ${fg} !important;
                box-shadow: 0 0 0 1px ${widgetBorder} !important;
            }
            .fieldColourEyedropper {
                color: ${fg} !important;
            }
            .fieldColourEyedropper:hover {
                background: rgba(255,255,255,0.08) !important;
            }

            /* Grid dropdown (@blockly/field-grid-dropdown) */
            .blocklyFieldGrid .blocklyFieldGridItem {
                font-family: ${font} !important;
                font-size: ${fontSize}px !important;
                padding: 4px 10px !important;
                color: ${fg} !important;
                border-color: ${widgetBorder} !important;
            }
            .blocklyFieldGrid .blocklyFieldGridItem:focus {
                box-shadow: 0 0 0 2px ${selectionBg} !important;
            }
            .blocklyFieldGrid .blocklyFieldGridItemSelected {
                background-color: ${selectionBg} !important;
            }
            /* Colour picker grid — remove borders from colour swatches */
            .blocklyFieldColour .blocklyFieldGrid .blocklyFieldGridItem {
                border: none !important;
                padding: 0 !important;
                border-radius: 0 !important;
            }

            /* FieldCombobox (custom field — function return type, etc.) */
            .blocklyComboboxItem {
                padding: 6px 12px;
                cursor: pointer;
                white-space: nowrap;
                font-size: ${fontSize}px;
                font-family: ${font};
                color: ${fg};
            }
            .blocklyComboboxItem:hover {
                background: ${selectionBg};
            }
            .blocklyComboboxItemSelected {
                background: rgba(255,255,255,0.12);
                font-weight: 600;
            }
            .blocklyComboboxItemSelected:hover {
                background: ${selectionBg};
            }
            .blocklyComboboxSeparator {
                height: 1px;
                background: ${widgetBorder};
                margin: 4px 0;
            }
            .blocklyComboboxInputRow {
                padding: 4px 8px 6px;
            }
            .blocklyComboboxInput {
                width: 100%;
                box-sizing: border-box;
                padding: 4px 6px;
                font-size: ${fontSize}px;
                font-family: ${font};
                border: 1px solid ${widgetBorder};
                border-radius: 3px;
                background: rgba(0,0,0,0.3);
                color: ${fg};
                outline: none;
            }
            .blocklyComboboxInput:focus {
                border-color: var(--vscode-focusBorder, #007fd4);
            }
            .blocklyTypedParamLabel {
                font-size: ${Math.max(fontSize - 2, 10)}px;
                font-family: ${font};
                color: ${fg};
                opacity: 0.6;
                min-width: 36px;
            }
        `;
    }

    public dispose() {
    }
}
