/**
 * Errors that a target's `assemble*` step can throw to signal that generation
 * should be refused (rather than silently producing something wrong). Pure
 * (no Blockly/VS Code deps) so it can be imported by both the webview
 * generator bundle and the host, and thrown/caught across that boundary.
 */

/**
 * Thrown when a file marked "secondary" (see `assembleSketch`'s `isSecondary`
 * option) still has top-level (loop) blocks or a non-empty Setup block. A
 * secondary file only contributes includes/declarations/helper functions to
 * the project — it must not define its own `setup()`/`loop()`, so its
 * entry-point content has nowhere safe to go.
 */
export class SecondaryFileEntryPointError extends Error {
    constructor() {
        super(
            'A secondary file cannot contain top-level blocks or a Setup block, ' +
            'since it does not generate its own setup()/loop(). Move that code to ' +
            'the main sketch file, or uncheck "Secondary file".'
        );
        this.name = 'SecondaryFileEntryPointError';
    }
}
