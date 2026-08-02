import * as Blockly from 'blockly';
import { LanguageProfile } from './languageProfile';

/**
 * A first-party imperative block generator, selected by a catalog block's
 * `generator:` field. Receives the active runtime's generator and returns the
 * block's code, with side effects on `definitions_`. Supplied per-runtime via
 * `RuntimeGenerator.firstPartyGenerators` (so core stays target-agnostic).
 */
export type FirstPartyGenerator = (
    block: Blockly.Block,
    generator: Blockly.CodeGenerator,
) => string | [string, number];

/**
 * A generation engine bound to a specific catalog `runtime` (`<framework>:<language>`).
 *
 * The engine is selected by runtime, NOT by language: two frameworks that share
 * a language (e.g. `arduino:cpp` vs `espidf:cpp`) emit structurally different
 * C++ (scaffolding, includes, idioms), so each runtime owns its own generator.
 *
 * A runtime is a *composition*: a `language` profile (axis 1, reusable across
 * frameworks) plus the target-specific assembly/scaffolding baked into the
 * generator (axis 2). It also supplies its own first-party generators so the
 * agnostic `CodeFactory` never imports anything target-specific.
 */
export interface RuntimeGenerator {
    /** Canonical runtime key, e.g. `arduino:cpp`. */
    readonly runtime: string;
    /** The configured Blockly generator (init/finish/scrub_ + standard-block handlers). */
    readonly generator: Blockly.CodeGenerator;
    /** The language profile this runtime composes (precedence, reserved words, L1 blocks). */
    readonly language: LanguageProfile;
    /** Imperative-tier generators selected by a block's `generator:` field. */
    readonly firstPartyGenerators: Record<string, FirstPartyGenerator>;
    /** Produce the full source file for the given workspace. */
    generate(workspace: Blockly.Workspace): string;
    /**
     * Mark (or unmark) the next `generate()` call as targeting a "secondary"
     * file — one that must not define its own program entry point(s) (e.g.
     * `setup()`/`loop()` in arduino:cpp). Optional: targets without an entry
     * point concept (or where multiple definitions across files aren't a
     * build error) can leave this unimplemented, and the UI toggle is a no-op
     * for them.
     */
    setSecondary?(isSecondary: boolean): void;
}
