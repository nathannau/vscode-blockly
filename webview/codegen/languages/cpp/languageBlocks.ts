import * as Blockly from 'blockly';

import { FieldTypedParamInput } from '../../../custom-fields/FieldTypedParamInput';
import { blockStyleFor } from '../../../ThemeAdapter';
import { defineSwitchCaseBlock } from '../shared/blockDefs';
import { ORDER } from './order';
import { registerArduinoStringGenerators } from './strings';

// Blockly variable-model "type" tag reserved for constants (declare_constant/
// get_constant), so their field_variable dropdowns only ever list constants —
// never mixed in with, or confused for, regular variables. Consumed by
// plugins.ts's initConstantCategory to create constants with this same type.
export const CONSTANT_VAR_TYPE = 'constant';

// Same idea, for arrays (array_declare/array_get/array_set). Consumed by
// plugins.ts's initArrayCategory.
export const ARRAY_VAR_TYPE = 'array';

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

// Scalar C++ types offered wherever a block lets you pick one (typed
// variables, declare_variable, array_declare's element type, …).
const SCALAR_TYPE_OPTIONS: [string, string][] = [
    ['int', 'int'], ['long', 'long'],
    ['int8_t', 'int8_t'], ['int16_t', 'int16_t'], ['int32_t', 'int32_t'],
    ['unsigned int', 'unsigned int'], ['unsigned long', 'unsigned long'],
    ['byte', 'byte'], ['word', 'word'],
    ['uint8_t', 'uint8_t'], ['uint16_t', 'uint16_t'], ['uint32_t', 'uint32_t'],
    ['float', 'float'], ['double', 'double'],
    ['bool', 'bool'], ['char', 'char'], ['String', 'String'],
];

// declare_variable's own field_variable allowlist: '' (name-only-created,
// untyped variables) plus every legacy scalar type (variables created via the
// old typed-variable modal) — everything a "regular variable" could be, but
// deliberately not CONSTANT_VAR_TYPE/ARRAY_VAR_TYPE, so those never show up
// in this picker (and vice versa — see their own blocks' variableTypes).
// Exported so plugins.ts can apply the same restriction to Blockly's built-in
// variables_get/variables_set/math_change (not custom JSON block defs, so
// they can't take a variableTypes arg the same way — see patchPlainVariableBlocks).
export const REGULAR_VARIABLE_TYPES: string[] = ['', ...SCALAR_TYPE_OPTIONS.map(([, value]) => value)];

/** Zero-equivalent literal for one of SCALAR_TYPE_OPTIONS's types; 'int'/'0' for anything else. */
function defaultInitForCppType(type: string): string {
    switch (type) {
        case 'float':  case 'double': return '0.0';
        case 'bool':                  return 'false';
        case 'char':                  return "'\\0'";
        case 'String':                return '""';
        default:                      return '0';
    }
}

function cppTypeInfo(
    block: Blockly.Block,
    varId: string,
): { type: string; init: string } {
    const model = block.workspace.getVariableMap().getVariableById(varId);
    const t = model?.getType() || 'int';
    const known = SCALAR_TYPE_OPTIONS.some(([, value]) => value === t);
    const type = known ? t : 'int';
    return { type, init: defaultInitForCppType(type) };
}

// Block types whose STACK/MEMBERS input is a real C++ function body — a
// declare_variable nested (at any depth) inside one of these is a genuine
// local variable; one that isn't is file scope (goes to decl_var_, like a
// scalar auto-declared by variables_get_dynamic). getSurroundParent() walks
// through nested statement inputs (if/loops/etc.) but stops at simple
// "stacked below" chaining, so this correctly finds the *enclosing block*,
// not just the previous one.
const FUNCTION_CONTAINER_TYPES = new Set([
    'cpp_procedures_defnoreturn', 'cpp_procedures_defreturn', 'code_setup',
]);

/** Exported for generator.ts's init(), which pre-scans the whole workspace once
 *  per run to find variables with a local declare_variable — see localDeclaredVarIds
 *  there and its use in the auto-declare fallbacks below. */
export function isInsideFunction(block: Blockly.Block): boolean {
    for (let parent = block.getSurroundParent(); parent; parent = parent.getSurroundParent()) {
        if (FUNCTION_CONTAINER_TYPES.has(parent.type)) return true;
    }
    return false;
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
            type: 'declare_constant',
            message0: '%{BKY_DECLARE_CONSTANT_MSG}',
            args0: [
                {
                    type: 'field_variable', name: 'VAR', variable: 'MY_CONSTANT',
                    variableTypes: [CONSTANT_VAR_TYPE], defaultType: CONSTANT_VAR_TYPE,
                },
                { type: 'field_input', name: 'VALUE', text: '0' },
            ],
            inputsInline: true,
            previousStatement: null,
            nextStatement: null,
            style: blockStyleFor('Constants'),
            tooltip: '%{BKY_DECLARE_CONSTANT_TOOLTIP}',
        },
        {
            type: 'get_constant',
            message0: '%1',
            args0: [
                {
                    type: 'field_variable', name: 'VAR', variable: 'MY_CONSTANT',
                    variableTypes: [CONSTANT_VAR_TYPE], defaultType: CONSTANT_VAR_TYPE,
                },
            ],
            output: null,
            style: blockStyleFor('Constants'),
            tooltip: '%{BKY_GET_CONSTANT_TOOLTIP}',
        },
        {
            type: 'declare_variable',
            message0: '%{BKY_DECLARE_VARIABLE_MSG}',
            args0: [
                {
                    type: 'field_variable', name: 'VAR', variable: 'x',
                    variableTypes: REGULAR_VARIABLE_TYPES, defaultType: '',
                },
                { type: 'field_dropdown', name: 'TYPE', options: SCALAR_TYPE_OPTIONS },
                { type: 'field_checkbox', name: 'STATIC', checked: false },
            ],
            inputsInline: true,
            previousStatement: null,
            nextStatement: null,
            style: blockStyleFor('Variables'),
            tooltip: '%{BKY_DECLARE_VARIABLE_TOOLTIP}',
        },
        {
            type: 'array_declare',
            message0: '%{BKY_ARRAY_DECLARE_MSG}',
            args0: [
                {
                    type: 'field_variable', name: 'VAR', variable: 'arr',
                    variableTypes: [ARRAY_VAR_TYPE], defaultType: ARRAY_VAR_TYPE,
                },
                { type: 'field_dropdown', name: 'TYPE', options: SCALAR_TYPE_OPTIONS },
                { type: 'field_number', name: 'SIZE', value: 8, min: 1, precision: 1 },
                { type: 'field_checkbox', name: 'STATIC', checked: false },
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
                {
                    type: 'field_variable', name: 'VAR', variable: 'arr',
                    variableTypes: [ARRAY_VAR_TYPE], defaultType: ARRAY_VAR_TYPE,
                },
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
                {
                    type: 'field_variable', name: 'VAR', variable: 'arr',
                    variableTypes: [ARRAY_VAR_TYPE], defaultType: ARRAY_VAR_TYPE,
                },
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
    localDeclaredVarIds: () => ReadonlySet<string>,
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
    // A variable that has its own local declare_variable somewhere never gets
    // an auto-declared global too — otherwise that global would be unstatic
    // dead code at best, and a link-time name collision (exactly what
    // declare_variable's static option exists to avoid) at worst.
    const hasOwnDeclaration = (varId: string) => paramVarIds.has(varId) || localDeclaredVarIds().has(varId);
    // True only for a variable created through the legacy typed-variable modal
    // (its Blockly variable model carries a real type). New variables (created
    // with the now name-only "Create variable…" button) have none — many
    // blocks that reference a variable (declare_variable, but also things like
    // "try button positions in random order", which declares its own loop
    // variable inline) fully own that variable's declaration themselves, so
    // guessing "int" here would at best add a dead unstatic global and at
    // worst shadow/collide with what that block already declared.
    const hasExplicitCppType = (block: Blockly.Block, varId: string): boolean =>
        !!block.workspace.getVariableMap().getVariableById(varId)?.getType();

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

    // The Global-declarations section is emitted in definitions_'s key
    // insertion order (see categorizeDefinitions). Plain reassignment of an
    // *existing* key leaves it in its original position (standard JS object
    // semantics), so if the same name is ever declared twice (e.g. a leftover
    // duplicate declare_variable/declare_constant), the second, "winning"
    // value would silently render at the *first* declaration's old position
    // instead of where it actually happens in the generation order — deleting
    // before reassigning forces it to move to the end, where it belongs.
    const setDeclaration = (name: string, decl: string) => {
        const key = `decl_var_${name}`;
        delete (g as any).definitions_[key];
        (g as any).definitions_[key] = decl;
    };

    // Auto-declare fallback for a variable that has no explicit `declare_variable`
    // block: only fills in decl_var_ if nothing has claimed it yet, so it can
    // never clobber an explicit declaration regardless of which block Blockly
    // happens to generate first (declare_variable's own write is unconditional,
    // so it always wins in the end either way — this just stops the *other*
    // direction: this fallback overwriting an already-explicit declaration).
    const declareVarIfAbsent = (name: string, decl: string) => {
        const key = `decl_var_${name}`;
        if (!(g as any).definitions_[key]) (g as any).definitions_[key] = decl;
    };

    f['variables_get_dynamic'] = (b) => {
        const varId = b.getFieldValue('VAR');
        const name = g.getVariableName(varId);
        if (!hasOwnDeclaration(varId) && hasExplicitCppType(b, varId)) {
            const { type, init } = cppTypeInfo(b, varId);
            declareVarIfAbsent(name, `${storageClass()}${type} ${name} = ${init};`);
        }
        return [name, ORDER.ATOMIC];
    };

    f['variables_set_dynamic'] = (b) => {
        const varId = b.getFieldValue('VAR');
        const name = g.getVariableName(varId);
        const { type, init } = cppTypeInfo(b, varId);
        const value = val(b, 'VALUE', ORDER.NONE, init);
        if (!hasOwnDeclaration(varId) && hasExplicitCppType(b, varId)) {
            declareVarIfAbsent(name, `${storageClass()}${type} ${name} = ${init};`);
        }
        return `${name} = ${value};\n`;
    };

    // variables_get/variables_set/math_change (Blockly's plain, untyped
    // variable blocks) never auto-declare: they have no type information to
    // offer beyond a blind "int" guess, and now that declare_variable exists,
    // using one of these on a variable nothing has declared is a real mistake
    // that should surface as a compiler error, not get silently papered over
    // with a wrong, unstatic global.
    f['variables_get'] = (b) => {
        const varId = b.getFieldValue('VAR');
        return [g.getVariableName(varId), ORDER.ATOMIC];
    };

    f['variables_set'] = (b) => {
        const varId = b.getFieldValue('VAR');
        const value = val(b, 'VALUE', ORDER.NONE, '0');
        const name = g.getVariableName(varId);
        return `${name} = ${value};\n`;
    };

    f['math_change'] = (b) => {
        const varId = b.getFieldValue('VAR');
        const delta = val(b, 'DELTA', ORDER.ADDITIVE, '0');
        const name = g.getVariableName(varId);
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
        // Not static by default: a secondary file's helper functions are often
        // its public interface (e.g. `jeu1_start`/`jeu1_loop`/`jeu1_stop`
        // called from main.cpp) — but a purely internal helper (e.g. a
        // `boucle()` that happens to share its name with one in another file)
        // can opt into internal linkage via the block's own "static" checkbox,
        // the same explicit per-declaration choice declare_variable/array_declare
        // already offer for variables/arrays.
        const isStatic = block.getFieldValue('STATIC') === 'TRUE';
        const storagePrefix = isStatic ? 'static ' : '';
        (g as any).definitions_[`func_${name}`] =
            `${storagePrefix}${returnType} ${name}(${paramList}) {\n${body}${returnLine}}\n`;
        // A forward declaration too, hoisted to its own section before every
        // full definition (see assembleSketch) — otherwise whether "A calls B"
        // compiles would depend on whether B happens to be generated before A,
        // which isn't something the block canvas has any reason to guarantee.
        (g as any).definitions_[`proto_${name}`] = `${storagePrefix}${returnType} ${name}(${paramList});`;
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

    // ── Constants ────────────────────────────────────────────────────────────

    // A `#define` (untyped, unlike declare_variable): purely a preprocessor
    // text substitution, so it has no C++ linkage at all — never collides
    // across secondary files the way a variable can (nothing is ever linked;
    // by link time every use has already been replaced by the literal value
    // in each translation unit) — no static/isSecondaryFile concern, ever.
    // #define also isn't lexically scoped to a function the way a real
    // declaration is (the preprocessor doesn't know what a function is), so
    // unlike declare_variable there's no local-vs-global placement choice
    // either: it's always file scope, wherever it's dropped on the canvas.
    f['declare_constant'] = (b) => {
        const varId = b.getFieldValue('VAR');
        const name = g.getVariableName(varId);
        const value = String(b.getFieldValue('VALUE') ?? '0');
        setDeclaration(name, `#define ${name} ${value}`);
        return '';
    };

    // Reading a constant is identical to reading a plain variable — declare_constant
    // already put its full `#define` where it belongs, so there's nothing left
    // to auto-declare or guess a type for here.
    f['get_constant'] = (b) => {
        const varId = b.getFieldValue('VAR');
        return [g.getVariableName(varId), ORDER.ATOMIC];
    };

    // ── Arrays ──────────────────────────────────────────────────────────────

    // Scope follows placement: inside a function/Setup body, this declares a
    // genuine C++ local (persistent across calls only if "static" is
    // checked); outside any function (including loose at the top of a
    // secondary file), it's a file-scope declaration instead — the same
    // decl_var_ zone scalar variables auto-declare into, but with an
    // explicit, changeable type and an explicit static/non-static choice
    // rather than whatever the variable happened to be created with.
    f['declare_variable'] = (b) => {
        const varId = b.getFieldValue('VAR');
        const name = g.getVariableName(varId);
        const type = b.getFieldValue('TYPE');
        const isStatic = b.getFieldValue('STATIC') === 'TRUE';
        const init = defaultInitForCppType(type);
        const decl = `${isStatic ? 'static ' : ''}${type} ${name} = ${init};`;
        if (isInsideFunction(b)) {
            return `${decl}\n`;
        }
        setDeclaration(name, decl);
        return '';
    };

    // Declaration only: writes to the same decl_var_ zone as scalar variables
    // (variables_get_dynamic etc.) and returns no inline code. array_get/
    // array_set below only ever *index into* an array — this is what actually
    // brings one into existence, value-initialized to all zeros.
    // Static if the "static" checkbox is ticked *or* the file is secondary
    // (the latter kept as a safety net for arrays that predate the checkbox).
    f['array_declare'] = (b) => {
        const varId = b.getFieldValue('VAR');
        const name = g.getVariableName(varId);
        const elementType = b.getFieldValue('TYPE');
        const size = b.getFieldValue('SIZE');
        const isStatic = b.getFieldValue('STATIC') === 'TRUE' || isSecondaryFile();
        setDeclaration(name, `${isStatic ? 'static ' : ''}${elementType} ${name}[${size}] = {};`);
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
