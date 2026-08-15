import { LanguageProfile } from '../../core/languageProfile';
import { registerCppLanguageBlocks, CPP_KEYWORDS } from './languageBlocks';

/**
 * Catalog-facing precedence vocabulary (the `CodegenPrecedence` names) mapped to
 * C++ numeric levels. Used by `CodeFactory` to decide parenthesisation of
 * declarative value blocks. (The imperative L1 generators use the richer `ORDER`
 * table in ./order.ts internally; this is the narrower catalog-author vocabulary.)
 */
const CPP_PRECEDENCE: Readonly<Record<string, number>> = {
    ATOMIC: 0,
    UNARY_PREFIX: 3,
    MULTIPLICATION: 5,
    ADDITION: 6,
    RELATIONAL: 9,
    EQUALITY: 10,
    LOGICAL_AND: 14,
    LOGICAL_OR: 15,
    NONE: 99,
};

/** The C++ language profile (axis 1): reusable by any `<framework>:cpp` runtime. */
export const cppLanguageProfile: LanguageProfile = {
    id: 'cpp',
    reservedWords: CPP_KEYWORDS,
    precedence: CPP_PRECEDENCE,
    registerLanguageBlocks(generator, ctx) {
        registerCppLanguageBlocks(generator, ctx.paramVarIds, ctx.isSecondaryFile);
    },
};
