import * as Blockly from 'blockly';
import { PythonGenerator } from 'blockly/python';
import { pythonLanguageProfile } from '../../../languages/python';
import { FieldTypedParamInput } from '../../../../custom-fields/FieldTypedParamInput';
// Importing the field binds it for the instanceof check below and triggers its
// self-registration (field_param_input). Python callback params (hat-style
// blocks) use this untyped field; C++ procedure rows use FieldTypedParamInput.
import { FieldParamInput } from '../../../../custom-fields/FieldParamInput';
import { assembleScript } from '../../../../../src/codegen/targets/arduino/python/assemble';
import { formatGeneratedAt } from '../../../../../src/codegen/generatedAt';
import { RuntimeGenerator } from '../../../core/runtimeGenerator';
import { blockCommentPrefix } from '../../../core/commentAnnotation';
import { FIRST_PARTY_GENERATORS } from './firstParty';
import { ARDUINO_PYTHON_RUNTIME } from '../../../../../src/codegen/runtimes';

export { ARDUINO_PYTHON_RUNTIME };

/**
 * arduino:python generation engine (axis 2). Builds on Blockly's stock
 * PythonGenerator for the primitive language blocks (composed via
 * `pythonLanguageProfile`, axis 1) and assembles the final App Lab script via
 * `assembleScript`. The structural analogue of `targets/arduino/cpp/generator.ts`.
 */
class ArduinoPythonGenerator extends PythonGenerator {
    // Widened from protected — catalog codegen + section routers write
    // import_*/decl_*/setup_* entries through this map (same contract as the cpp
    // generator's definitions_).
    public declare definitions_: { [key: string]: string };
    private paramVarIds_: Set<string> = new Set();

    constructor() {
        super('ArduinoPython');
    }

    // PythonGenerator.init() writes ALL workspace variables as "x = None" into
    // definitions_.variables — including procedure parameters, which must not
    // appear as module-level declarations (they're already in the signature).
    // Rebuild definitions_.variables after the parent runs, excluding params.
    override init(workspace: Blockly.Workspace): void {
        super.init(workspace);

        const paramVarIds = new Set<string>();
        for (const block of workspace.getAllBlocks(false)) {
            if (block.type === 'procedures_defnoreturn' || block.type === 'procedures_defreturn') {
                for (const v of block.getVarModels()) paramVarIds.add(v.getId());
            }
            for (const input of block.inputList) {
                for (const field of input.fieldRow) {
                    if (field instanceof FieldParamInput || field instanceof FieldTypedParamInput) {
                        const varId = field.getVarId();
                        if (varId) paramVarIds.add(varId);
                    }
                }
            }
        }

        // Pre-register parameter variables in nameDB_ (populateVariables only
        // sees variables exposed via getVarModels()).
        for (const varId of paramVarIds) {
            this.getVariableName(varId);
        }

        this.paramVarIds_ = paramVarIds;
        if (paramVarIds.size === 0) return;

        const nonParamVars = Blockly.Variables.allUsedVarModels(workspace).filter(
            (v) => !paramVarIds.has(v.getId()),
        );

        if (nonParamVars.length === 0) {
            delete this.definitions_['variables'];
        } else {
            this.definitions_['variables'] = nonParamVars
                .map((v) => `${this.getVariableName(v.getId())} = None`)
                .join('\n');
        }
    }

    override finish(code: string): string {
        const paramVarNames = new Set<string>();
        for (const varId of this.paramVarIds_) {
            paramVarNames.add(this.getVariableName(varId));
        }

        const loopBody = code ? this.prefixLines(code.replace(/\n+$/, ''), this.INDENT) : '';
        const result = assembleScript(this.definitions_, loopBody, this.INDENT, this.PASS, paramVarNames, formatGeneratedAt(new Date()));

        this.definitions_ = Object.create(null);
        this.paramVarIds_ = new Set();
        this.nameDB_?.reset();

        return result;
    }

    // Stock PythonGenerator.scrub_ already emits a block's own comment (and the
    // comments of its value inputs). Override it to share the exact same policy
    // as the cpp generator: always emit the user's own comment, add the tooltip
    // as a fallback when the setting is on, and never annotate expression blocks
    // or empty emitters. Statement chaining is replicated from the parent.
    override scrub_(block: Blockly.Block, code: string, thisOnly?: boolean): string {
        const prefix = blockCommentPrefix(block, code, this as unknown as Blockly.CodeGenerator, '# ');
        const nextBlock = block.nextConnection ? block.nextConnection.targetBlock() : null;
        const nextCode = thisOnly ? '' : (this.blockToCode(nextBlock) as string);
        return prefix + code + nextCode;
    }
}

export function createArduinoPythonGenerator(): RuntimeGenerator {
    const g = new ArduinoPythonGenerator();
    g.addReservedWords(pythonLanguageProfile.reservedWords.join(','));
    // Python scripts aren't link-combined the way PlatformIO/arduino-cli combine
    // C++ translation units, so there's no "secondary file" or declare_variable
    // concept here — this runtime doesn't implement RuntimeGenerator.setSecondary either.
    pythonLanguageProfile.registerLanguageBlocks(g as unknown as Blockly.CodeGenerator, {
        paramVarIds: new Set(),
        isSecondaryFile: () => false,
        localDeclaredVarIds: () => new Set(),
    });

    return {
        runtime: ARDUINO_PYTHON_RUNTIME,
        generator: g as unknown as Blockly.CodeGenerator,
        language: pythonLanguageProfile,
        firstPartyGenerators: FIRST_PARTY_GENERATORS,
        generate: (workspace: Blockly.Workspace) => g.workspaceToCode(workspace),
    };
}
