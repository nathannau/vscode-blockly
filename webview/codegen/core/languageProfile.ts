import * as Blockly from 'blockly';

/**
 * The language-level (axis 1) codegen contract: everything about emitting code
 * that depends on the *language* alone (`cpp`, `python`, …), reusable across any
 * target/framework that shares that language.
 *
 * A `RuntimeGenerator` (axis 2) composes one of these with a target-specific
 * assembler. The agnostic `CodeFactory` reads `precedence` from here instead of
 * owning a language-specific table.
 */
export interface LanguageProfile {
    /** Canonical language id, e.g. `cpp`. */
    readonly id: string;
    /** Reserved words to register with the Blockly name database. */
    readonly reservedWords: readonly string[];
    /**
     * Catalog-facing precedence vocabulary (the `CodegenPrecedence` names —
     * ATOMIC/UNARY_PREFIX/MULTIPLICATION/… — see `src/catalog/CatalogTypes.ts`)
     * mapped to this language's numeric levels, used to decide parenthesisation
     * of declarative `codegen.precedence` value blocks. Distinct from the
     * imperative `ORDER` the L1 generators use internally.
     */
    readonly precedence: Readonly<Record<string, number>>;
    /** Install this language's L1 block generators onto the runtime's generator. */
    registerLanguageBlocks(
        generator: Blockly.CodeGenerator,
        ctx: {
            paramVarIds: ReadonlySet<string>;
            /**
             * Live read of the target's current "secondary file" flag (see
             * `RuntimeGenerator.setSecondary`). A function (not a plain boolean)
             * so it stays correct across a run even though `registerLanguageBlocks`
             * itself only runs once per generator instance — languages that don't
             * have a "secondary file" concept (e.g. python) can ignore it.
             */
            isSecondaryFile: () => boolean;
            /**
             * Live read of the set of variable ids with their own local
             * declaration somewhere in the workspace (recomputed once per
             * generation run — see the cpp target's init()). A variable in
             * this set never gets an auto-declared global fallback, the same
             * way a procedure parameter (paramVarIds) doesn't. Also a
             * function for the same staleness reason as isSecondaryFile.
             */
            localDeclaredVarIds: () => ReadonlySet<string>;
        },
    ): void;
}
