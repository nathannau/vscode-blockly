import * as Blockly from 'blockly';
import { applyBlockCodegen, applyCodegenSections } from './templateEngine';
import { RuntimeGenerator } from './runtimeGenerator';
import { getRuntimeGenerator } from './generatorRegistry';
import { resolveColor, categoryStyleFor, ensureCategoryRegistered, setCatalogColor, resetCatalogState } from '../../ThemeAdapter';
import { preprocessCatalogI18n } from './catalogI18nPreprocess';

const registeredBlockTypes = new Set<string>();

export class CodeFactory {
    private categoryTree = new Map<string, any>();
    private rg: RuntimeGenerator | undefined;
    // Block types registered during the current loadCatalogEntries pass, used to
    // detect duplicate catalog entries (distinct from registeredBlockTypes, which
    // persists across reloads so the same blocks aren't redefined on reload).
    private seenThisLoad = new Set<string>();
    private categoryTranslator: ((key: string) => string) | undefined;

    constructor() {}

    public setCategoryTranslator(fn: (key: string) => string): void {
        this.categoryTranslator = fn;
    }

    /**
     * Select the generation engine for the active runtime. Returns false if no
     * generator is registered for it (caller shows "framework not supported").
     */
    public setRuntime(runtime: string): boolean {
        this.rg = getRuntimeGenerator(runtime);
        this.categoryTree.clear();
        return !!this.rg;
    }

    public loadCatalogEntries(entries: any[], locale = 'en'): void {
        // Rebuild from scratch — this may be called again when catalogs reload,
        // and the category tree must not accumulate duplicates.
        this.categoryTree.clear();
        this.seenThisLoad.clear();
        resetCatalogState();
        if (!this.rg) return;

        preprocessCatalogI18n(entries, locale);

        for (const entry of entries) {
            // Entries are pre-filtered by the host to the active runtime; pick the
            // matching implementation and register its blocks onto that generator.
            const impl = entry.implementations.find((i: any) => i.runtime === this.rg!.runtime);
            if (!impl) continue;

            if (entry.colour) setCatalogColor(entry.category, entry.colour);

            const categoryColour = resolveColor(entry.category);

            for (const blockDef of impl.blocks) {
                if (this.registerBlock(blockDef, impl, categoryColour)) {
                    this.addToCategory(entry.category, blockDef.blockly.type);
                }
            }
        }
    }

    public getCatalogToolboxCategories(): any[] {
        const result: any[] = [];
        for (const [name, node] of this.categoryTree) {
            result.push(this.buildCategory(name, node));
        }
        return result;
    }

    public generateCode(workspace: Blockly.Workspace, options?: { secondary?: boolean }): string {
        // The runtime generator's finish() returns the fully assembled source.
        // May throw (e.g. SecondaryFileEntryPointError) — left to the caller.
        if (!this.rg) return '';
        this.rg.setSecondary?.(!!options?.secondary);
        return this.rg.generate(workspace);
    }

    private registerBlock(blockDef: any, impl: any, fallbackColour?: string): boolean {
        const blockType = blockDef.blockly.type;

        // Collision with a built-in block (L1 language block or a Blockly
        // built-in) that the catalog layer doesn't own: keep the built-in, skip
        // the catalog block entirely (definition + generator + category) so a
        // catalog can't silently clobber a built-in. registeredBlockTypes marks
        // catalog-owned types, so this allows re-registration on reload.
        if (!registeredBlockTypes.has(blockType) && (blockType in Blockly.Blocks)) {
            console.warn(`[CodeFactory] catalog block "${blockType}" collides with a built-in block type — skipping (built-in kept).`);
            return false;
        }

        // Duplicate catalog type within this load pass: keep the first, skip the rest.
        if (this.seenThisLoad.has(blockType)) {
            console.warn(`[CodeFactory] duplicate catalog block type "${blockType}" — skipping (first definition kept).`);
            return false;
        }
        this.seenThisLoad.add(blockType);

        // Define block in Blockly UI (only the first time ever — persists across reloads)
        if (!registeredBlockTypes.has(blockType)) {
            registeredBlockTypes.add(blockType);
            const def = fallbackColour && blockDef.blockly.colour === undefined
                ? { ...blockDef.blockly, colour: fallbackColour }
                : blockDef.blockly;
            Blockly.common.defineBlocksWithJsonArray([def]);
        }

        const codegen = blockDef.codegen;
        const implCodegen = impl.codegen;
        const isValueBlock = 'output' in blockDef.blockly;
        const generator = this.rg!.generator;
        // Precedence is a language concern: the active runtime's language profile
        // owns the catalog precedence vocabulary → numeric level mapping.
        const precedenceLevels = this.rg!.language.precedence;
        const precedence = codegen?.precedence !== undefined ? precedenceLevels[codegen.precedence] : undefined;

        // Imperative tier: a `generator:` field selects a first-party function
        // instead of the declarative codegen wrapper (for blocks the template
        // engine can't express, e.g. code_setup). Supplied per-runtime.
        if (blockDef.generator) {
            const fn = this.rg!.firstPartyGenerators[blockDef.generator];
            if (fn) {
                generator.forBlock[blockType] = (block: Blockly.Block) => fn(block, generator);
            } else {
                console.warn(`[CodeFactory] unknown first-party generator "${blockDef.generator}" for block "${blockType}"`);
                generator.forBlock[blockType] = () => (isValueBlock ? ['', precedenceLevels.NONE] : '');
            }
            return true;
        }

        // Register code generator onto the active runtime's generator.
        generator.forBlock[blockType] = (block: Blockly.Block) => {
            if (implCodegen) applyCodegenSections(implCodegen, generator);
            if (!codegen) return isValueBlock ? ['', precedenceLevels.NONE] : '';

            const bodyCode = applyBlockCodegen(codegen, block, generator);

            if (isValueBlock && precedence !== undefined) {
                return [bodyCode.replace(/\n$/, ''), precedence];
            }
            return bodyCode;
        };

        return true;
    }

    private addToCategory(category: string, blockType: string): void {
        const parts = category.split('::');
        const topName = parts[0];

        if (!this.categoryTree.has(topName)) {
            this.categoryTree.set(topName, { blocks: [], children: new Map() });
        }
        let node = this.categoryTree.get(topName)!;

        // Register the top-level category with ThemeAdapter so its
        // categorystyle key resolves. Subcategories have no colour.
        ensureCategoryRegistered(topName);
        for (let i = 1; i < parts.length; i++) {
            const childName = parts[i];
            if (!node.children.has(childName)) {
                node.children.set(childName, { blocks: [], children: new Map() });
            }
            node = node.children.get(childName)!;
        }

        node.blocks.push(blockType);
    }

    private buildCategory(key: string, node: any, parentStyle?: string): any {
        const contents: any[] = [];
        const style = parentStyle ?? categoryStyleFor(key);
        const displayName = this.categoryTranslator ? this.categoryTranslator(key) : key;

        for (const blockType of node.blocks) {
            contents.push({ kind: 'block', type: blockType });
        }

        for (const [childKey, childNode] of node.children) {
            contents.push(this.buildCategory(childKey, childNode, style));
        }

        return { kind: 'category', _key: key, name: displayName, contents, categorystyle: style };
    }
}
