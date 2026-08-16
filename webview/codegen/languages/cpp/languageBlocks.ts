import * as Blockly from 'blockly';

import { FieldTypedParamInput } from '../../../custom-fields/FieldTypedParamInput';
import { blockStyleFor } from '../../../ThemeAdapter';
import { defineSwitchCaseBlock } from '../shared/blockDefs';
import { ORDER } from './order';
import { registerArduinoStringGenerators } from './strings';

export const CPP_KEYWORDS = [
    'auto', 'break', 'case', 'catch', 'char', 'class', 'const', 'constexpr',
    'continue', 'default', 'delete', 'do', 'double', 'else', 'enum', 'explicit',
    'extern', 'false', 'float', 'for', 'friend', 'goto', 'if', 'inline', 'int',
    'long', 'mutable', 'namespace', 'new', 'noexcept', 'nullptr', 'operator',
    'private', 'protected', 'public', 'register', 'return', 'short', 'signed',
    'sizeof', 'static', 'static_assert', 'static_cast', 'struct', 'switch',
    'template', 'this', 'thread_local', 'throw', 'true', 'try', 'typedef',
    'typeid', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void',
    'volatile', 'wchar_t', 'while',
    'concept', 'consteval', 'constinit', 'co_await', 'co_return', 'co_yield',
    'requires', 'char8_t',
];

function cppTypeInfo(
    block: Blockly.Block,
    varId: string,
): { type: string; init: string } {
    const model = block.workspace.getVariableMap().getVariableById(varId);
    const t = model?.getType() || 'int';
    switch (t) {
        case 'int':            return { type: 'int',            init: '0' };
        case 'long':           return { type: 'long',           init: '0' };
        case 'int8_t':         return { type: 'int8_t',         init: '0' };
        case 'int16_t':        return { type: 'int16_t',        init: '0' };
        case 'int32_t':        return { type: 'int32_t',        init: '0' };
        case 'unsigned int':   return { type: 'unsigned int',   init: '0' };
        case 'unsigned long':  return { type: 'unsigned long',  init: '0' };
        case 'byte':           return { type: 'byte',           init: '0' };
        case 'word':           return { type: 'word',           init: '0' };
        case 'uint8_t':        return { type: 'uint8_t',        init: '0' };
        case 'uint16_t':       return { type: 'uint16_t',       init: '0' };
        case 'uint32_t':       return { type: 'uint32_t',       init: '0' };
        case 'float':          return { type: 'float',          init: '0.0' };
        case 'double':         return { type: 'double',         init: '0.0' };
        case 'bool':           return { type: 'bool',           init: 'false' };
        case 'char':           return { type: 'char',           init: "'\\0'" };
        case 'String':         return { type: 'String',         init: '""' };
        default:               return { type: 'int',            init: '0' };
    }
}

// ── Custom block definitions (not in Blockly core) ──────────────────────────

const customBlocksDefined: Set<string> = new Set();

function defineCustomBlocks(): void {
    if (customBlocksDefined.size > 0) return;

    const defs: object[] = [
        // ── Symbol literal (like math_number but for identifiers) ────
        {
            type: 'symbol_literal',
            message0: '%1',
            args0: [{ type: 'field_input', name: 'SYMBOL', text: 'HIGH' }],
            output: null,
            style: blockStyleFor('Math'),
            tooltip: '%{BKY_SYMBOL_LITERAL_TOOLTIP}',
        },
        // ── Custom code ──────────────────────────────────────────────
        {
            type: 'code_statement',
            message0: '⟨ %1 ⟩',
            args0: [{ type: 'field_code', name: 'CODE', text: '' }],
            previousStatement: null,
            nextStatement: null,
            style: blockStyleFor('Text'),
            tooltip: '%{BKY_CODE_STATEMENT_TOOLTIP}',
        },
        {
            type: 'code_expression',
            message0: '⟨ %1 ⟩',
            args0: [{ type: 'field_input', name: 'CODE', text: 'expression' }],
            output: null,
            style: blockStyleFor('Text'),
            tooltip: '%{BKY_CODE_EXPRESSION_TOOLTIP}',
        },
        {
            type: 'code_declaration',
            message0: '%{BKY_CODE_DECLARATION_MSG}',
            args0: [{ type: 'input_statement', name: 'MEMBERS' }],
            style: blockStyleFor('Text'),
            tooltip: '%{BKY_CODE_DECLARATION_TOOLTIP}',
        },
        // ── do...while ───────────────────────────────────────────────
        {
            type: 'controls_doWhile',
            message0: '%{BKY_DO_WHILE_MSG}',
            args0: [
                { type: 'input_statement', name: 'DO' },
                { type: 'input_value', name: 'BOOL', check: 'Boolean' },
            ],
            previousStatement: null,
            nextStatement: null,
            style: blockStyleFor('Loops'),
            tooltip: '%{BKY_DO_WHILE_TOOLTIP}',
        },
        {
            type: 'bitwise_operation',
            message0: '%1 %2 %3',
            args0: [
                { type: 'input_value', name: 'A' },
                {
                    type: 'field_dropdown', name: 'OP',
                    options: [['&', 'AND'], ['|', 'OR'], ['^', 'XOR'], ['<<', 'LSHIFT'], ['>>', 'RSHIFT']],
                },
                { type: 'input_value', name: 'B' },
            ],
            inputsInline: true,
            output: null,
            style: blockStyleFor('Math'),
            tooltip: '%{BKY_BITWISE_OP_TOOLTIP}',
        },
        {
            type: 'bitwise_not',
            message0: '~ %1',
            args0: [{ type: 'input_value', name: 'VALUE' }],
            output: null,
            style: blockStyleFor('Math'),
            tooltip: '%{BKY_BITWISE_NOT_TOOLTIP}',
        },
        {
            type: 'type_cast',
            message0: '(%1) %2',
            args0: [
                {
                    type: 'field_dropdown', name: 'TYPE',
                    options: [
                        ['int', 'int'], ['long', 'long'], ['float', 'float'], ['double', 'double'],
                        ['char', 'char'], ['byte', 'byte'], ['bool', 'bool'],
                        ['unsigned int', 'unsigned int'], ['unsigned long', 'unsigned long'],
                        ['uint8_t', 'uint8_t'], ['uint16_t', 'uint16_t'], ['uint32_t', 'uint32_t'],
                    ],
                },
                { type: 'input_value', name: 'VALUE' },
            ],
            inputsInline: true,
            output: null,
            style: blockStyleFor('Math'),
            tooltip: '%{BKY_TYPE_CAST_TOOLTIP}',
        },
        {
            type: 'return_statement',
            message0: '%{BKY_RETURN_MSG}',
            args0: [{ type: 'input_value', name: 'VALUE' }],
            previousStatement: null,
            nextStatement: null,
            style: blockStyleFor('Functions'),
            tooltip: '%{BKY_RETURN_TOOLTIP}',
        },
        {
            type: 'array_declare',
            message0: '%{BKY_ARRAY_DECLARE_MSG}',
            args0: [
                { type: 'field_variable', name: 'VAR', variable: 'arr' },
                {
                    type: 'field_dropdown', name: 'TYPE',
                    options: [
                        ['int', 'int'], ['long', 'long'],
                        ['int8_t', 'int8_t'], ['int16_t', 'int16_t'], ['int32_t', 'int32_t'],
                        ['unsigned int', 'unsigned int'], ['unsigned long', 'unsigned long'],
                        ['byte', 'byte'], ['word', 'word'],
                        ['uint8_t', 'uint8_t'], ['uint16_t', 'uint16_t'], ['uint32_t', 'uint32_t'],
                        ['float', 'float'], ['double', 'double'],
                        ['bool', 'bool'], ['char', 'char'], ['String', 'String'],
                    ],
                },
                { type: 'field_number', name: 'SIZE', value: 8, min: 1, precision: 1 },
            ],
            inputsInline: true,
            previousStatement: null,
            nextStatement: null,
            style: blockStyleFor('Arrays'),
            tooltip: '%{BKY_ARRAY_DECLARE_TOOLTIP}',
        },
        {
            type: 'array_get',
            message0: '%1 [ %2 ]',
            args0: [
                { type: 'field_variable', name: 'VAR', variable: 'arr' },
                { type: 'input_value', name: 'INDEX' },
            ],
            inputsInline: true,
            output: null,
            style: blockStyleFor('Arrays'),
            tooltip: '%{BKY_ARRAY_GET_TOOLTIP}',
        },
        {
            type: 'array_set',
            message0: '%1 [ %2 ] = %3',
            args0: [
                { type: 'field_variable', name: 'VAR', variable: 'arr' },
                { type: 'input_value', name: 'INDEX' },
                { type: 'input_value', name: 'VALUE' },
            ],
            inputsInline: true,
            previousStatement: null,
            nextStatement: null,
            style: blockStyleFor('Arrays'),
            tooltip: '%{BKY_ARRAY_SET_TOOLTIP}',
        },
    ];

    Blockly.common.defineBlocksWithJsonArray(defs);
    for (const d of defs) customBlocksDefined.add((d as { type: string }).type);

    defineSwitchCaseBlock();
}

export function registerCppLanguageBlocks(
    g: Blockly.CodeGenerator,
    paramVarIds: ReadonlySet<string>,
    isSecondaryFile: () => boolean,
): void {
    defineCustomBlocks();
    const f = g.forBlock;
    const val = (b: Blockly.Block, name: string, order: number, fallback: string) =>
        g.valueToCode(b, name, order) || fallback;
    // A secondary file's globals (variables and helper functions) get internal
    // linkage: PlatformIO/arduino-cli compile every source file together, so an
    // externally-linked name (the C++ default) that happens to match one in
    // another file is a link error, not just a scoping accident.
    const storageClass = () => (isSecondaryFile() ? 'static ' : '');

    // ── Logic ───────────────────────────────────────────────────────────────

    f['controls_if'] = (b) => {
        let n = 0;
        let code = '';
        do {
            const condition = val(b, 'IF' + n, ORDER.NONE, 'false');
            const branch = g.statementToCode(b, 'DO' + n);
            code += `${n > 0 ? ' else ' : ''}if (${condition}) {\n${branch}}`;
            n++;
        } while (b.getInput('IF' + n));

        if (b.getInput('ELSE')) {
            code += ` else {\n${g.statementToCode(b, 'ELSE')}}`;
        }
        return code + '\n';
    };

    f['logic_compare'] = (b) => {
        const op = b.getFieldValue('OP');
        const SYMBOLS: Record<string, string> = { EQ: '==', NEQ: '!=', LT: '<', LTE: '<=', GT: '>', GTE: '>=' };
        const order = (op === 'EQ' || op === 'NEQ') ? ORDER.EQUALITY : ORDER.RELATIONAL;
        return [`${val(b, 'A', order, '0')} ${SYMBOLS[op]} ${val(b, 'B', order, '0')}`, order];
    };

    f['logic_operation'] = (b) => {
        const op = b.getFieldValue('OP');
        const symbol = op === 'AND' ? '&&' : '||';
        const order = op === 'AND' ? ORDER.LOGICAL_AND : ORDER.LOGICAL_OR;
        return [`${val(b, 'A', order, 'false')} ${symbol} ${val(b, 'B', order, 'false')}`, order];
    };

    f['logic_negate'] = (b) => [`!${val(b, 'BOOL', ORDER.UNARY, 'false')}`, ORDER.UNARY];

    f['logic_boolean'] = (b) => [b.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false', ORDER.ATOMIC];

    f['logic_ternary'] = (b) => {
        const cond = val(b, 'IF', ORDER.CONDITIONAL, 'false');
        const ifTrue = val(b, 'THEN', ORDER.CONDITIONAL, '0');
        const ifFalse = val(b, 'ELSE', ORDER.CONDITIONAL, '0');
        return [`(${cond} ? ${ifTrue} : ${ifFalse})`, ORDER.CONDITIONAL];
    };

    f['controls_switch_case'] = (b) => {
        const INDENT = g.INDENT;
        const expr = val(b, 'SWITCH_EXPR', ORDER.NONE, '0');
        const reindent = (code: string): string =>
            code.split('\n').map(l => (l ? INDENT + l : l)).join('\n');

        let code = `switch (${expr}) {\n`;
        for (let i = 0; b.getInput(`CASE_${i}_VAL`); i++) {
            const caseVal = val(b, `CASE_${i}_VAL`, ORDER.NONE, '0');
            const body = g.statementToCode(b, `CASE_${i}_BODY`);
            code += `${INDENT}case ${caseVal}:\n`;
            if (body) code += reindent(body);
            code += `${INDENT}${INDENT}break;\n`;
        }
        const defaultBody = g.statementToCode(b, 'DEFAULT_BODY');
        if (defaultBody) {
            code += `${INDENT}default:\n`;
            code += reindent(defaultBody);
        }
        code += '}\n';
        return code;
    };

    // ── Loops ────────────────────────────────────────────────────────────────

    f['controls_repeat_ext'] = (b) => {
        const repeats = val(b, 'TIMES', ORDER.NONE, '0');
        const body = g.statementToCode(b, 'DO');
        return `for (int _i = 0; _i < ${repeats}; _i++) {\n${body}}\n`;
    };

    f['controls_whileUntil'] = (b) => {
        const until = b.getFieldValue('MODE') === 'UNTIL';
        const cond = val(b, 'BOOL', until ? ORDER.UNARY : ORDER.NONE, 'false');
        const body = g.statementToCode(b, 'DO');
        return `while (${until ? `!(${cond})` : cond}) {\n${body}}\n`;
    };

    f['controls_for'] = (b) => {
        const varName = g.getVariableName(b.getFieldValue('VAR'));
        const from = val(b, 'FROM', ORDER.NONE, '0');
        const to   = val(b, 'TO',   ORDER.NONE, '0');
        const by   = val(b, 'BY',   ORDER.NONE, '1');
        const body = g.statementToCode(b, 'DO');
        return `for (int ${varName} = ${from}; ${varName} <= ${to}; ${varName} += ${by}) {\n${body}}\n`;
    };

    f['controls_flow_statements'] = (b) => {
        return b.getFieldValue('FLOW') === 'BREAK' ? 'break;\n' : 'continue;\n';
    };

    // ── Math ─────────────────────────────────────────────────────────────────

    f['math_number'] = (b) => {
        const raw = String(b.getFieldValue('NUM'));
        const order = raw.startsWith('-') ? ORDER.UNARY : ORDER.ATOMIC;
        return [raw, order];
    };

    f['math_arithmetic'] = (b) => {
        const op = b.getFieldValue('OP');
        if (op === 'POWER') {
            return [`pow(${val(b, 'A', ORDER.NONE, '0')}, ${val(b, 'B', ORDER.NONE, '0')})`, ORDER.FUNCTION_CALL];
        }
        const OPS: Record<string, [string, number]> = {
            ADD: [' + ', ORDER.ADDITIVE],
            MINUS: [' - ', ORDER.ADDITIVE],
            MULTIPLY: [' * ', ORDER.MULTIPLICATIVE],
            DIVIDE: [' / ', ORDER.MULTIPLICATIVE],
        };
        const [symbol, order] = OPS[op];
        return [val(b, 'A', order, '0') + symbol + val(b, 'B', order, '0'), order];
    };

    f['math_modulo'] = (b) => {
        const left  = val(b, 'DIVIDEND', ORDER.MULTIPLICATIVE, '0');
        const right = val(b, 'DIVISOR', ORDER.MULTIPLICATIVE, '1');
        return [`${left} % ${right}`, ORDER.MULTIPLICATIVE];
    };

    f['math_single'] = (b) => {
        const op  = b.getFieldValue('OP');
        const num = val(b, 'NUM', ORDER.NONE, '0');
        switch (op) {
            case 'ROOT':  return [`sqrt(${num})`,      ORDER.FUNCTION_CALL];
            case 'ABS':   return [`abs(${num})`,       ORDER.FUNCTION_CALL];
            case 'NEG':   return [`(-${num})`,         ORDER.UNARY];
            case 'LN':    return [`log(${num})`,       ORDER.FUNCTION_CALL];
            case 'LOG10': return [`log10(${num})`,     ORDER.FUNCTION_CALL];
            case 'EXP':   return [`exp(${num})`,       ORDER.FUNCTION_CALL];
            case 'POW10': return [`pow(10, ${num})`,   ORDER.FUNCTION_CALL];
            default:      return [`abs(${num})`,       ORDER.FUNCTION_CALL];
        }
    };

    f['math_trig'] = (b) => {
        const op  = b.getFieldValue('OP');
        const num = val(b, 'NUM', ORDER.NONE, '0');
        const toRad = `(${num}) * M_PI / 180.0`;
        const fromRad = (fn: string) => `${fn} * 180.0 / M_PI`;
        switch (op) {
            case 'SIN':  return [`sin(${toRad})`,              ORDER.FUNCTION_CALL];
            case 'COS':  return [`cos(${toRad})`,              ORDER.FUNCTION_CALL];
            case 'TAN':  return [`tan(${toRad})`,              ORDER.FUNCTION_CALL];
            case 'ASIN': return [fromRad(`asin(${num})`),      ORDER.MULTIPLICATIVE];
            case 'ACOS': return [fromRad(`acos(${num})`),      ORDER.MULTIPLICATIVE];
            case 'ATAN': return [fromRad(`atan(${num})`),      ORDER.MULTIPLICATIVE];
            default:     return [`sin(${toRad})`,              ORDER.FUNCTION_CALL];
        }
    };

    f['math_constant'] = (b) => {
        switch (b.getFieldValue('CONSTANT')) {
            case 'PI':           return ['M_PI',           ORDER.ATOMIC];
            case 'E':            return ['M_E',            ORDER.ATOMIC];
            case 'GOLDEN_RATIO': return ['1.61803398875',  ORDER.ATOMIC];
            case 'SQRT2':        return ['M_SQRT2',        ORDER.ATOMIC];
            case 'SQRT1_2':      return ['M_SQRT1_2',      ORDER.ATOMIC];
            case 'INFINITY':     return ['INFINITY',       ORDER.ATOMIC];
            default:             return ['M_PI',           ORDER.ATOMIC];
        }
    };

    f['math_round'] = (b) => {
        const op  = b.getFieldValue('OP');
        const num = val(b, 'NUM', ORDER.NONE, '0');
        switch (op) {
            case 'ROUND':     return [`round(${num})`, ORDER.FUNCTION_CALL];
            case 'ROUNDUP':   return [`ceil(${num})`,  ORDER.FUNCTION_CALL];
            case 'ROUNDDOWN': return [`floor(${num})`, ORDER.FUNCTION_CALL];
            default:          return [`round(${num})`, ORDER.FUNCTION_CALL];
        }
    };

    f['math_number_property'] = (b) => {
        const prop = b.getFieldValue('PROPERTY');
        const num  = val(b, 'NUMBER_TO_CHECK', ORDER.NONE, '0');
        switch (prop) {
            case 'EVEN':         return [`((int)(${num}) % 2 == 0)`,  ORDER.EQUALITY];
            case 'ODD':          return [`((int)(${num}) % 2 != 0)`,  ORDER.EQUALITY];
            case 'WHOLE':        return [`((float)(${num}) == (int)(${num}))`, ORDER.EQUALITY];
            case 'POSITIVE':     return [`(${num} > 0)`,              ORDER.RELATIONAL];
            case 'NEGATIVE':     return [`(${num} < 0)`,              ORDER.RELATIONAL];
            case 'DIVISIBLE_BY': {
                const div = val(b, 'DIVISOR', ORDER.NONE, '1');
                return [`((int)(${num}) % (int)(${div}) == 0)`, ORDER.EQUALITY];
            }
            case 'PRIME': {
                (g as any).definitions_['func__isPrime'] =
                    'bool _isPrime(long n) {\n' +
                    '  if (n < 2) return false;\n' +
                    '  for (long i = 2; i * i <= n; i++) { if (n % i == 0) return false; }\n' +
                    '  return true;\n' +
                    '}';
                return [`_isPrime((long)(${num}))`, ORDER.FUNCTION_CALL];
            }
            default:
                return [`(${num} > 0)`, ORDER.RELATIONAL];
        }
    };

    // ── Text ─────────────────────────────────────────────────────────────────

    f['text'] = (b) => {
        const raw = String(b.getFieldValue('TEXT'));
        const escaped = raw
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\t/g, '\\t');
        return [`"${escaped}"`, ORDER.ATOMIC];
    };

    // ── Variables ────────────────────────────────────────────────────────────

    f['variables_get_dynamic'] = (b) => {
        const varId = b.getFieldValue('VAR');
        const name = g.getVariableName(varId);
        if (!paramVarIds.has(varId)) {
            const { type, init } = cppTypeInfo(b, varId);
            (g as any).definitions_[`decl_var_${name}`] = `${storageClass()}${type} ${name} = ${init};`;
        }
        return [name, ORDER.ATOMIC];
    };

    f['variables_set_dynamic'] = (b) => {
        const varId = b.getFieldValue('VAR');
        const name = g.getVariableName(varId);
        const { type, init } = cppTypeInfo(b, varId);
        const value = val(b, 'VALUE', ORDER.NONE, init);
        if (!paramVarIds.has(varId)) {
            (g as any).definitions_[`decl_var_${name}`] = `${storageClass()}${type} ${name} = ${init};`;
        }
        return `${name} = ${value};\n`;
    };

    f['variables_get'] = (b) => {
        const varId = b.getFieldValue('VAR');
        const name = g.getVariableName(varId);
        if (!paramVarIds.has(varId)) {
            (g as any).definitions_[`decl_var_${name}`] = `${storageClass()}int ${name} = 0;`;
        }
        return [name, ORDER.ATOMIC];
    };

    f['variables_set'] = (b) => {
        const varId = b.getFieldValue('VAR');
        const value = val(b, 'VALUE', ORDER.NONE, '0');
        const name = g.getVariableName(varId);
        if (!paramVarIds.has(varId)) {
            (g as any).definitions_[`decl_var_${name}`] = `${storageClass()}int ${name} = 0;`;
        }
        return `${name} = ${value};\n`;
    };

    f['math_change'] = (b) => {
        const varId = b.getFieldValue('VAR');
        const delta = val(b, 'DELTA', ORDER.ADDITIVE, '0');
        const name = g.getVariableName(varId);
        if (!paramVarIds.has(varId)) {
            (g as any).definitions_[`decl_var_${name}`] = `${storageClass()}int ${name} = 0;`;
        }
        return `${name} += ${delta};\n`;
    };

    // ── Functions (C++ procedures) ───────────────────────────────────────────

    const buildCallArgs = (block: Blockly.Block): string => {
        const argIds = block.getVars();
        return argIds
            .map((_id, i) => g.valueToCode(block, `ARG${i}`, ORDER.NONE) || '0')
            .join(', ');
    };

    // ── Typed C++ procedures ─────────────────────────────────────────────────

    const buildCppDef = (
        block: Blockly.Block,
        returnType: string,
    ): null => {
        const name = g.getProcedureName(block.getFieldValue('NAME'));
        const params: string[] = [];
        for (const input of block.inputList) {
            for (const field of input.fieldRow) {
                if (field instanceof FieldTypedParamInput) {
                    const varId = field.getVarId();
                    const paramName = varId
                        ? g.getVariableName(varId)
                        : field.getParamName();
                    params.push(`${field.getParamType()} ${paramName}`);
                }
            }
        }
        const paramList = params.join(', ');
        const body = g.statementToCode(block, 'STACK') || '';
        const isVoid = returnType === 'void';
        const returnValue = isVoid
            ? ''
            : g.valueToCode(block, 'RETURN', ORDER.NONE) || '0';
        const returnLine = isVoid
            ? ''
            : `${g.INDENT}return ${returnValue};\n`;
        // Deliberately not `static`: a secondary file's helper functions are
        // often its public interface (e.g. `jeu1_start`/`jeu1_loop`/`jeu1_stop`
        // called from main.cpp), unlike its variables, which are private state.
        (g as any).definitions_[`func_${name}`] =
            `${returnType} ${name}(${paramList}) {\n${body}${returnLine}}\n`;
        return null;
    };

    f['cpp_procedures_defnoreturn'] = (block) => buildCppDef(block, 'void');

    f['cpp_procedures_defreturn'] = (block) =>
        buildCppDef(block, block.getFieldValue('RETURN_TYPE') || 'int');

    f['cpp_procedures_callnoreturn'] = (block) => {
        const name = g.getProcedureName(block.getFieldValue('NAME'));
        return `${name}(${buildCallArgs(block)});\n`;
    };

    f['cpp_procedures_callreturn'] = (block) => {
        const name = g.getProcedureName(block.getFieldValue('NAME'));
        return [`${name}(${buildCallArgs(block)})`, ORDER.FUNCTION_CALL];
    };

    f['cpp_procedures_ifreturn'] = (block) => {
        const cond = val(block, 'CONDITION', ORDER.NONE, 'false');
        const hasReturn = (block as Blockly.Block & { hasReturnValue_?: boolean })
            .hasReturnValue_;
        const value = hasReturn
            ? g.valueToCode(block, 'VALUE', ORDER.NONE) || '0'
            : '';
        return `if (${cond}) {\n${g.INDENT}return${value ? ` ${value}` : ''};\n}\n`;
    };

    // ── do...while ──────────────────────────────────────────────────────────

    f['controls_doWhile'] = (b) => {
        const cond = val(b, 'BOOL', ORDER.NONE, 'false');
        const body = g.statementToCode(b, 'DO');
        return `do {\n${body}} while (${cond});\n`;
    };

    // ── Bitwise ─────────────────────────────────────────────────────────────

    f['bitwise_operation'] = (b) => {
        const op = b.getFieldValue('OP');
        const OPS: Record<string, [string, number]> = {
            AND:    [' & ',  ORDER.MULTIPLICATIVE],
            OR:     [' | ',  ORDER.ADDITIVE],
            XOR:    [' ^ ',  ORDER.ADDITIVE],
            LSHIFT: [' << ', ORDER.ADDITIVE],
            RSHIFT: [' >> ', ORDER.ADDITIVE],
        };
        const [symbol, order] = OPS[op] ?? [' & ', ORDER.MULTIPLICATIVE];
        return [`${val(b, 'A', order, '0')}${symbol}${val(b, 'B', order, '0')}`, order];
    };

    f['bitwise_not'] = (b) => {
        return [`~${val(b, 'VALUE', ORDER.UNARY, '0')}`, ORDER.UNARY];
    };

    // ── Type cast ───────────────────────────────────────────────────────────

    f['type_cast'] = (b) => {
        const type = b.getFieldValue('TYPE');
        const value = val(b, 'VALUE', ORDER.NONE, '0');
        return [`(${type})(${value})`, ORDER.UNARY];
    };

    // ── Return statement ────────────────────────────────────────────────────

    f['return_statement'] = (b) => {
        const value = g.valueToCode(b, 'VALUE', ORDER.NONE);
        return value ? `return ${value};\n` : 'return;\n';
    };

    // ── Arrays ──────────────────────────────────────────────────────────────

    // Declaration only: writes to the same decl_var_ zone as scalar variables
    // (variables_get_dynamic etc.) and returns no inline code. array_get/
    // array_set below only ever *index into* an array — this is what actually
    // brings one into existence, value-initialized to all zeros.
    f['array_declare'] = (b) => {
        const varId = b.getFieldValue('VAR');
        const name = g.getVariableName(varId);
        const elementType = b.getFieldValue('TYPE');
        const size = b.getFieldValue('SIZE');
        (g as any).definitions_[`decl_var_${name}`] = `${storageClass()}${elementType} ${name}[${size}] = {};`;
        return '';
    };

    f['array_get'] = (b) => {
        const varId = b.getFieldValue('VAR');
        const name = g.getVariableName(varId);
        const index = val(b, 'INDEX', ORDER.NONE, '0');
        return [`${name}[${index}]`, ORDER.ATOMIC];
    };

    f['array_set'] = (b) => {
        const varId = b.getFieldValue('VAR');
        const name = g.getVariableName(varId);
        const index = val(b, 'INDEX', ORDER.NONE, '0');
        const value = val(b, 'VALUE', ORDER.NONE, '0');
        return `${name}[${index}] = ${value};\n`;
    };

    // ── Text operations → L2 Arduino String generators (arduinoStringGenerators.ts) ──
    registerArduinoStringGenerators(g, paramVarIds);

    // ── Symbol literal ──────────────────────────────────────────────────

    f['symbol_literal'] = (b) => {
        const sym = String(b.getFieldValue('SYMBOL') || '').trim();
        return [sym || '0', ORDER.ATOMIC];
    };

    // ── Custom code (raw C++) ───────────────────────────────────────────

    f['code_statement'] = (b) => {
        const code = String(b.getFieldValue('CODE') || '');
        return code ? code + '\n' : '';
    };

    f['code_expression'] = (b) => {
        const code = String(b.getFieldValue('CODE') || '0');
        return [code, ORDER.ATOMIC];
    };

    f['code_declaration'] = (b) => {
        // Use blockToCode (not statementToCode) to avoid the indentation that
        // Blockly prepends for nested statements — file-scope declarations sit
        // at column 0.
        const target = b.getInputTargetBlock('MEMBERS');
        let members = target ? g.blockToCode(target) : '';
        if (Array.isArray(members)) members = members[0];
        if (!members.trim()) return '';
        (g as any).definitions_['decl_custom_' + b.id] = members.replace(/\n$/, '');
        return '';
    };
}
