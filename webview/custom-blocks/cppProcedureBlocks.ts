import * as Blockly from 'blockly';

import { FieldCombobox } from '../custom-fields/FieldCombobox';
import { FieldTypedParamInput } from '../custom-fields/FieldTypedParamInput';
import { createMinusField, createPlusField } from '../custom-fields/blocklyFieldHelpers';

import { blockStyleFor } from '../ThemeAdapter';

const BLOCK_STYLE = blockStyleFor('Functions');

const CPP_TYPE_PRESETS: [string, string][] = [
    ['int', 'int'],
    ['long', 'long'],
    ['float', 'float'],
    ['double', 'double'],
    ['bool', 'bool'],
    ['char', 'char'],
    ['String', 'String'],
    ['byte', 'byte'],
    ['unsigned int', 'unsigned int'],
    ['unsigned long', 'unsigned long'],
    ['uint8_t', 'uint8_t'],
    ['uint16_t', 'uint16_t'],
    ['uint32_t', 'uint32_t'],
];

const RETURN_TYPE_PRESETS: [string, string][] = CPP_TYPE_PRESETS;

const PARAM_NAMES = ['x', 'y', 'z', 'a', 'b', 'c', 'd', 'e', 'f', 'g'];

let argIdCounter = 0;
function nextArgId(): string {
    return `cppArg_${argIdCounter++}`;
}

interface ArgDatum { argId: string; }

interface CppProcedureDefBlock extends Blockly.Block {
    argData_: ArgDatum[];
    hasReturn_: boolean;
    callType_: string;
    plus(): void;
    minus(): void;
    addArg_(argId?: string, value?: string): void;
    removeArg_(argId: string): void;
    getParamInfo_(): Array<{ name: string; type: string; argId: string }>;
    getProcedureDef(): [string, string[], boolean];
    customContextMenu(options: Blockly.ContextMenuRegistry.ContextMenuOption[]): void;
    saveExtraState(): object;
    loadExtraState(state: {
        params?: Array<{ argId: string; value: string }>;
        returnType?: string;
    }): void;
}

interface CppProcedureCallBlock extends Blockly.Block {
    argCount_: number;
    getProcedureCall(): string;
    renameProcedure(oldName: string, newName: string): void;
    setProcedureParameters_(paramNames: string[], paramIds: string[]): void;
    getVars(): string[];
    saveExtraState(): object;
    loadExtraState(state: {
        name: string;
        params?: Array<{ name: string; argId: string }>;
    }): void;
}

function registerDefBlock(type: string, hasReturn: boolean): void {
    if (Blockly.Blocks[type]) return;

    Blockly.Blocks[type] = {
        init(this: CppProcedureDefBlock): void {
            this.argData_ = [];
            this.hasReturn_ = hasReturn;
            this.callType_ = hasReturn
                ? 'cpp_procedures_callreturn'
                : 'cpp_procedures_callnoreturn';

            this.appendDummyInput('TOP')
                .appendField(createPlusField(), 'PLUS')
                .appendField(Blockly.Msg['CPP_PROC_TO'] ?? 'to')
                .appendField(
                    new Blockly.FieldTextInput(Blockly.Msg['CPP_PROC_DEFAULT_NAME'] ?? 'do something', Blockly.Procedures.rename),
                    'NAME',
                )
                // Internal linkage: keeps a helper that's only ever called from
                // within this same file from colliding with a same-named one in
                // another file (PlatformIO/arduino-cli compile every source file
                // together) — leave unchecked for a function that's part of this
                // file's public interface (e.g. called from main.cpp).
                .appendField(Blockly.Msg['CPP_PROC_STATIC'] ?? 'static')
                .appendField(new Blockly.FieldCheckbox(false), 'STATIC');

            this.appendStatementInput('STACK');

            if (hasReturn) {
                this.appendValueInput('RETURN')
                    .setAlign(Blockly.inputs.Align.RIGHT)
                    .appendField(Blockly.Msg['CPP_PROC_RETURN'] ?? 'return')
                    .appendField(
                        new FieldCombobox(RETURN_TYPE_PRESETS, 'int'),
                        'RETURN_TYPE',
                    );
            }

            this.setStyle(BLOCK_STYLE);
            this.setTooltip(
                hasReturn
                    ? (Blockly.Msg['CPP_PROC_DEF_RETURN_TOOLTIP'] ?? 'Define a function with a typed return value.')
                    : (Blockly.Msg['CPP_PROC_DEF_NORETURN_TOOLTIP'] ?? 'Define a function that returns nothing (void).'),
            );
        },

        plus(this: CppProcedureDefBlock): void {
            this.addArg_();
            setTimeout(() => Blockly.Procedures.mutateCallers(this), 0);
        },

        minus(this: CppProcedureDefBlock): void {
            if (this.argData_.length === 0) return;
            const last = this.argData_[this.argData_.length - 1];
            this.removeArg_(last.argId);
            setTimeout(() => Blockly.Procedures.mutateCallers(this), 0);
        },

        addArg_(this: CppProcedureDefBlock, argId?: string, value?: string): void {
            const id = argId ?? nextArgId();
            this.argData_.push({ argId: id });

            const paramValue = value ?? `int|${PARAM_NAMES[this.argData_.length - 1] ?? `p${this.argData_.length}`}`;
            const fieldName = `PARAM_${id}`;
            const input = this.appendDummyInput(id);
            input.appendField(createMinusField(), `MINUS_${id}`);
            input.appendField(
                new FieldTypedParamInput(CPP_TYPE_PRESETS, paramValue),
                fieldName,
            );
            input.setAlign(Blockly.inputs.Align.RIGHT);

            if (this.getInput('STACK')) {
                this.moveInputBefore(id, 'STACK');
            }
        },

        removeArg_(this: CppProcedureDefBlock, argId: string): void {
            this.removeInput(argId);
            this.argData_ = this.argData_.filter((d) => d.argId !== argId);
        },

        getParamInfo_(
            this: CppProcedureDefBlock,
        ): Array<{ name: string; type: string; argId: string }> {
            return this.argData_.map(({ argId }) => {
                const field = this.getField(`PARAM_${argId}`);
                if (field instanceof FieldTypedParamInput) {
                    return {
                        name: field.getParamName(),
                        type: field.getParamType(),
                        argId,
                    };
                }
                return { name: 'x', type: 'int', argId };
            });
        },

        getProcedureDef(this: CppProcedureDefBlock): [string, string[], boolean] {
            const name = this.getFieldValue('NAME') || '';
            const paramNames = this.getParamInfo_().map(
                (p) => `${p.type} ${p.name}`,
            );
            return [name, paramNames, this.hasReturn_];
        },

        customContextMenu(
            this: CppProcedureDefBlock,
            options: Blockly.ContextMenuRegistry.ContextMenuOption[],
        ): void {
            if (this.isInFlyout) return;

            const callType = this.callType_;
            const name = this.getFieldValue('NAME') || '';
            const params = this.getParamInfo_();

            const ws = this.workspace;
            options.push({
                enabled: true,
                text: Blockly.Msg['PROCEDURES_CREATE_DO']?.replace('%1', name) ??
                    `Create call "${name}"`,
                callback: (): void => {
                    const callerBlock = ws.newBlock(callType);
                    callerBlock.setFieldValue(name, 'NAME');
                    (callerBlock as unknown as CppProcedureCallBlock).setProcedureParameters_(
                        params.map((p) => `${p.type} ${p.name}`),
                        params.map((p) => p.argId),
                    );
                    (callerBlock as unknown as Blockly.BlockSvg).initSvg?.();
                    (callerBlock as unknown as Blockly.BlockSvg).render?.();
                },
                scope: { block: this as unknown as Blockly.BlockSvg },
                weight: 100,
            } as Blockly.ContextMenuRegistry.ContextMenuOption);
        },

        saveExtraState(this: CppProcedureDefBlock): object {
            const params = this.argData_.map(({ argId }) => {
                const field = this.getField(`PARAM_${argId}`);
                return {
                    argId,
                    value: field instanceof FieldTypedParamInput
                        ? field.getValue() ?? 'int|x'
                        : 'int|x',
                };
            });
            const state: Record<string, unknown> = { params };
            if (this.hasReturn_) {
                state.returnType = this.getFieldValue('RETURN_TYPE') || 'int';
            }
            return state;
        },

        loadExtraState(
            this: CppProcedureDefBlock,
            state: {
                params?: Array<{ argId: string; value: string }>;
                returnType?: string;
            },
        ): void {
            for (const { argId } of [...this.argData_]) {
                this.removeInput(argId);
            }
            this.argData_ = [];

            for (const { argId, value } of state.params ?? []) {
                this.addArg_(argId, value);
            }

            if (this.hasReturn_ && state.returnType) {
                const rtField = this.getField('RETURN_TYPE');
                if (rtField) rtField.setValue(state.returnType);
            }
        },
    };
}

registerDefBlock('cpp_procedures_defnoreturn', false);
registerDefBlock('cpp_procedures_defreturn', true);

// ── Call blocks ─────────────────────────────────────────────────────────────

function registerCallBlock(type: string, isValue: boolean): void {
    if (Blockly.Blocks[type]) return;

    Blockly.Blocks[type] = {
        init(this: CppProcedureCallBlock): void {
            this.argCount_ = 0;

            this.appendDummyInput('TOPROW').appendField('', 'NAME');

            if (isValue) {
                this.setOutput(true, null);
            } else {
                this.setPreviousStatement(true);
                this.setNextStatement(true);
            }

            this.setStyle(BLOCK_STYLE);
            this.setTooltip(
                isValue
                    ? (Blockly.Msg['CPP_PROC_CALL_RETURN_TOOLTIP'] ?? 'Call a function that returns a value.')
                    : (Blockly.Msg['CPP_PROC_CALL_TOOLTIP'] ?? 'Call a function.'),
            );
        },

        getProcedureCall(this: CppProcedureCallBlock): string {
            return this.getFieldValue('NAME') || '';
        },

        renameProcedure(
            this: CppProcedureCallBlock,
            oldName: string,
            newName: string,
        ): void {
            if (Blockly.Names.equals(oldName, this.getFieldValue('NAME'))) {
                this.setFieldValue(newName, 'NAME');
            }
        },

        setProcedureParameters_(
            this: CppProcedureCallBlock,
            paramNames: string[],
            _paramIds: string[],
        ): void {
            for (let i = 0; i < this.argCount_; i++) {
                this.removeInput(`ARG${i}`);
            }

            this.argCount_ = paramNames.length;
            for (let i = 0; i < paramNames.length; i++) {
                this.appendValueInput(`ARG${i}`)
                    .setAlign(Blockly.inputs.Align.RIGHT)
                    .appendField(paramNames[i]);
            }
        },

        getVars(this: CppProcedureCallBlock): string[] {
            const result: string[] = [];
            for (let i = 0; i < this.argCount_; i++) {
                result.push(`ARG${i}`);
            }
            return result;
        },

        saveExtraState(this: CppProcedureCallBlock): object {
            const name = this.getFieldValue('NAME') || '';
            const params: Array<{ name: string; argId: string }> = [];
            for (let i = 0; i < this.argCount_; i++) {
                const input = this.getInput(`ARG${i}`);
                const label = input?.fieldRow.find(
                    (f) => f.name !== `ARG${i}`,
                );
                params.push({
                    name: label?.getText() ?? `arg${i}`,
                    argId: `ARG${i}`,
                });
            }
            return { name, params };
        },

        loadExtraState(
            this: CppProcedureCallBlock,
            state: {
                name: string;
                params?: Array<{ name: string; argId: string }>;
            },
        ): void {
            this.setFieldValue(state.name || '', 'NAME');
            const params = state.params ?? [];
            this.setProcedureParameters_(
                params.map((p) => p.name),
                params.map((p) => p.argId),
            );
        },
    };
}

registerCallBlock('cpp_procedures_callnoreturn', false);
registerCallBlock('cpp_procedures_callreturn', true);

// ── ifreturn block ──────────────────────────────────────────────────────────

const CPP_FUNCTION_TYPES = [
    'cpp_procedures_defnoreturn',
    'cpp_procedures_defreturn',
];

if (!Blockly.Blocks['cpp_procedures_ifreturn']) {
    Blockly.Blocks['cpp_procedures_ifreturn'] = {
        init(this: Blockly.Block & { hasReturnValue_: boolean }): void {
            this.hasReturnValue_ = true;

            this.appendValueInput('CONDITION')
                .setCheck('Boolean')
                .appendField(Blockly.Msg['CONTROLS_IF_MSG_IF'] ?? 'if');
            this.appendValueInput('VALUE')
                .appendField(Blockly.Msg['PROCEDURES_DEFRETURN_RETURN'] ?? 'return');

            this.setPreviousStatement(true);
            this.setNextStatement(true);
            this.setStyle(BLOCK_STYLE);
            this.setTooltip(
                Blockly.Msg['PROCEDURES_IFRETURN_TOOLTIP'] ??
                    'If a value is true, then return a value.',
            );
        },

        onchange(
            this: Blockly.Block & { hasReturnValue_: boolean },
            event: Blockly.Events.Abstract,
        ): void {
            if (
                (this.workspace as Blockly.WorkspaceSvg).isDragging?.() ||
                (event.type !== Blockly.Events.BLOCK_MOVE &&
                    event.type !== Blockly.Events.BLOCK_CREATE)
            ) {
                return;
            }

            let legal = false;
            let surroundType = '';
            let block: Blockly.Block | null = this;
            do {
                if (CPP_FUNCTION_TYPES.includes(block.type)) {
                    legal = true;
                    surroundType = block.type;
                    break;
                }
                block = block.getSurroundParent();
            } while (block);

            if (legal) {
                if (
                    surroundType === 'cpp_procedures_defnoreturn' &&
                    this.hasReturnValue_
                ) {
                    this.removeInput('VALUE');
                    this.appendDummyInput('VALUE').appendField(
                        Blockly.Msg['PROCEDURES_DEFRETURN_RETURN'] ?? 'return',
                    );
                    this.hasReturnValue_ = false;
                } else if (
                    surroundType === 'cpp_procedures_defreturn' &&
                    !this.hasReturnValue_
                ) {
                    this.removeInput('VALUE');
                    this.appendValueInput('VALUE').appendField(
                        Blockly.Msg['PROCEDURES_DEFRETURN_RETURN'] ?? 'return',
                    );
                    this.hasReturnValue_ = true;
                }
                this.setWarningText(null);
            } else {
                this.setWarningText(
                    Blockly.Msg['PROCEDURES_IFRETURN_WARNING'] ??
                        'This block may only be used within a function definition.',
                );
            }

            if (!this.isInFlyout) {
                try {
                    Blockly.Events.setRecordUndo(false);
                    this.setDisabledReason(!legal, 'UNPARENTED_IFRETURN');
                } finally {
                    Blockly.Events.setRecordUndo(true);
                }
            }
        },
    };
}

// ── Flyout factory ──────────────────────────────────────────────────────────

export function initCppProcedureFlyout(workspace: Blockly.WorkspaceSvg): void {
    workspace.registerToolboxCategoryCallback(
        'CPP_PROCEDURE',
        (ws: Blockly.WorkspaceSvg): Blockly.utils.toolbox.FlyoutItemInfoArray => {
            const items: Blockly.utils.toolbox.FlyoutItemInfoArray = [];

            items.push({
                kind: 'block',
                type: 'cpp_procedures_defnoreturn',
                gap: 16,
                fields: { NAME: Blockly.Msg['PROCEDURES_DEFNORETURN_PROCEDURE'] ?? 'do something' },
            });
            items.push({
                kind: 'block',
                type: 'cpp_procedures_defreturn',
                gap: 24,
                fields: { NAME: Blockly.Msg['PROCEDURES_DEFRETURN_PROCEDURE'] ?? 'do something' },
            });

            const noReturnDefs: CppProcedureDefBlock[] = [];
            const returnDefs: CppProcedureDefBlock[] = [];
            for (const block of ws.getAllBlocks(false)) {
                if (block.type === 'cpp_procedures_defnoreturn') {
                    noReturnDefs.push(block as unknown as CppProcedureDefBlock);
                } else if (block.type === 'cpp_procedures_defreturn') {
                    returnDefs.push(block as unknown as CppProcedureDefBlock);
                }
            }

            for (const def of noReturnDefs) {
                const name = def.getFieldValue('NAME') || '';
                const params = def.getParamInfo_();
                items.push({
                    kind: 'block',
                    type: 'cpp_procedures_callnoreturn',
                    gap: 16,
                    extraState: {
                        name,
                        params: params.map((p) => ({
                            name: `${p.type} ${p.name}`,
                            argId: p.argId,
                        })),
                    },
                } as Blockly.utils.toolbox.BlockInfo);
            }

            for (const def of returnDefs) {
                const name = def.getFieldValue('NAME') || '';
                const params = def.getParamInfo_();
                items.push({
                    kind: 'block',
                    type: 'cpp_procedures_callreturn',
                    gap: 16,
                    extraState: {
                        name,
                        params: params.map((p) => ({
                            name: `${p.type} ${p.name}`,
                            argId: p.argId,
                        })),
                    },
                } as Blockly.utils.toolbox.BlockInfo);
            }

            items.push({
                kind: 'block',
                type: 'cpp_procedures_ifreturn',
                gap: 16,
            });

            return items;
        },
    );
}
