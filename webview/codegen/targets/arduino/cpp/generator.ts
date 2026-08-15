import * as Blockly from 'blockly';
import { cppLanguageProfile } from '../../../languages/cpp';
import { FieldTypedParamInput } from '../../../../custom-fields/FieldTypedParamInput';
import { categorizeDefinitions, assembleSketch } from '../../../../../src/codegen/targets/arduino/cpp/assemble';
import { formatGeneratedAt } from '../../../../../src/codegen/generatedAt';
import { RuntimeGenerator } from '../../../core/runtimeGenerator';
import { blockCommentPrefix } from '../../../core/commentAnnotation';
import { FIRST_PARTY_GENERATORS } from './firstParty';
import { ARDUINO_CPP_RUNTIME } from '../../../../../src/codegen/runtimes';

export { ARDUINO_CPP_RUNTIME };

let paramVarIds: Set<string> = new Set();
let isSecondaryFile = false;

export function createArduinoCppGenerator(): RuntimeGenerator {
    const g = new Blockly.CodeGenerator('arduino_cpp');
    g.INDENT = '  ';
    g.addReservedWords(cppLanguageProfile.reservedWords.join(','));

    const baseInit = (Blockly.CodeGenerator.prototype as any).init;

    (g as any).init = function (workspace: Blockly.Workspace) {
        if (typeof baseInit === 'function') baseInit.call(this, workspace);
        this.definitions_ = Object.create(null);
        this.definitions_['import_arduino_h'] = '#include <Arduino.h>';
        if (this.nameDB_) this.nameDB_.reset();
        else this.nameDB_ = new Blockly.Names(this.RESERVED_WORDS_ || '');
        this.nameDB_.setVariableMap(workspace.getVariableMap());
        this.nameDB_.populateVariables(workspace);
        this.nameDB_.populateProcedures(workspace);

        paramVarIds = new Set<string>();
        for (const block of workspace.getAllBlocks(false)) {
            if (
                block.type === 'procedures_defnoreturn' ||
                block.type === 'procedures_defreturn'
            ) {
                for (const v of block.getVarModels()) paramVarIds.add(v.getId());
            }
            for (const input of block.inputList) {
                for (const field of input.fieldRow) {
                    if (field instanceof FieldTypedParamInput) {
                        const varId = field.getVarId();
                        if (varId) paramVarIds.add(varId);
                    }
                }
            }
        }

        for (const varId of paramVarIds) {
            this.getVariableName(varId);
        }

        this.isInitialized = true;
    };

    (g as any).finish = function (code: string) {
        const sections = categorizeDefinitions(this.definitions_);
        this.isInitialized = false;
        if (this.nameDB_) this.nameDB_.reset();
        paramVarIds = new Set();
        return assembleSketch(sections, code, formatGeneratedAt(new Date()), isSecondaryFile);
    };

    (g as any).scrub_ = function (block: Blockly.Block, code: string, thisOnly?: boolean) {
        const prefix = blockCommentPrefix(block, code, this as Blockly.CodeGenerator, '// ');
        const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
        const nextCode = nextBlock && !thisOnly ? this.blockToCode(nextBlock) : '';
        return prefix + code + nextCode;
    };

    // Preserve the existing wiring exactly: registration captures the current
    // module-level `paramVarIds` reference; init() reassigns the module variable
    // per run. Do not change this timing — behavior must stay identical.
    // `isSecondaryFile` is passed as a getter (not the boolean itself) so the
    // one-time registration still reads whatever setSecondary() most recently set.
    cppLanguageProfile.registerLanguageBlocks(g, { paramVarIds, isSecondaryFile: () => isSecondaryFile });

    return {
        runtime: ARDUINO_CPP_RUNTIME,
        generator: g,
        language: cppLanguageProfile,
        firstPartyGenerators: FIRST_PARTY_GENERATORS,
        generate: (workspace: Blockly.Workspace) => g.workspaceToCode(workspace),
        setSecondary: (flag: boolean) => { isSecondaryFile = flag; },
    };
}
