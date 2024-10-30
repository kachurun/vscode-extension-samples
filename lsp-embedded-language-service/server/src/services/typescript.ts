import * as ts from 'typescript';
import { CompletionList, Diagnostic, Position, DiagnosticSeverity, CompletionItemKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';

interface CachedProgram {
    program: ts.Program;
    lastUpdated: number;
}

export interface TypeScriptLanguageService {
    doValidation(document: TextDocument): Diagnostic[];
    doComplete(document: TextDocument, position: Position): CompletionList;
}

function findConfigFile(searchPath: string): string | undefined {
    return ts.findConfigFile(searchPath, ts.sys.fileExists, 'tsconfig.json');
}

function readCompilerOptions(searchPath: string): ts.CompilerOptions {
    const configPath = findConfigFile(searchPath);

    if (!configPath) {
        // Default compiler options if no tsconfig is found
        return {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
            allowJs: true,
            strict: true
        };
    }

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(configPath)
    );

    return parsedConfig.options;
}

function convertKind(kind: ts.ScriptElementKind): CompletionItemKind {
    switch (kind) {
        case ts.ScriptElementKind.keyword: return CompletionItemKind.Keyword;
        case ts.ScriptElementKind.primitiveType: return CompletionItemKind.Keyword;
        case ts.ScriptElementKind.functionElement: return CompletionItemKind.Function;
        case ts.ScriptElementKind.memberFunctionElement: return CompletionItemKind.Method;
        case ts.ScriptElementKind.memberGetAccessorElement: return CompletionItemKind.Property;
        case ts.ScriptElementKind.memberSetAccessorElement: return CompletionItemKind.Property;
        case ts.ScriptElementKind.classElement: return CompletionItemKind.Class;
        case ts.ScriptElementKind.interfaceElement: return CompletionItemKind.Interface;
        case ts.ScriptElementKind.enumElement: return CompletionItemKind.Enum;
        case ts.ScriptElementKind.enumMemberElement: return CompletionItemKind.EnumMember;
        case ts.ScriptElementKind.moduleElement: return CompletionItemKind.Module;
        case ts.ScriptElementKind.variableElement: return CompletionItemKind.Variable;
        case ts.ScriptElementKind.constElement: return CompletionItemKind.Constant;
        case ts.ScriptElementKind.localVariableElement: return CompletionItemKind.Variable;
        case ts.ScriptElementKind.parameterElement: return CompletionItemKind.Variable;
        case ts.ScriptElementKind.typeParameterElement: return CompletionItemKind.TypeParameter;
        case ts.ScriptElementKind.constructorImplementationElement: return CompletionItemKind.Constructor;
        case ts.ScriptElementKind.alias: return CompletionItemKind.Reference;
        default: return CompletionItemKind.Text;
    }
}

export function getTypeScriptLanguageService(): TypeScriptLanguageService {
    let cachedProgram: CachedProgram | undefined;

    function createProgram(document: TextDocument): ts.Program {
        const fileName = document.uri.replace('file://', '');
        const workspacePath = path.dirname(fileName);
        const compilerOptions = readCompilerOptions(workspacePath);

        // Create a program only with the current file
        const host = ts.createCompilerHost(compilerOptions);
        const program = ts.createProgram({
            rootNames: [fileName],
            options: compilerOptions,
            host
        });

        cachedProgram = {
            program,
            lastUpdated: Date.now()
        };

        return program;
    }

    function createLanguageService(program: ts.Program): ts.LanguageService {
        const serviceHost: ts.LanguageServiceHost = {
            getScriptFileNames: () => [...program.getRootFileNames()],
            getScriptVersion: () => "1",
            getScriptSnapshot: (fileName) => {
                const sourceFile = program.getSourceFile(fileName);
                return sourceFile ? ts.ScriptSnapshot.fromString(sourceFile.getFullText()) : undefined;
            },
            getCurrentDirectory: () => process.cwd(),
            getCompilationSettings: () => program.getCompilerOptions(),
            getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
            fileExists: ts.sys.fileExists,
            readFile: ts.sys.readFile,
            readDirectory: ts.sys.readDirectory,
        };

        return ts.createLanguageService(serviceHost);
    }

    function getProgram(document: TextDocument): ts.Program {
        if (!cachedProgram || Date.now() - cachedProgram.lastUpdated > 5000) {
            return createProgram(document);
        }
        return cachedProgram.program;
    }

    return {
        doValidation(document: TextDocument): Diagnostic[] {
            const program = getProgram(document);
            const sourceFile = program.getSourceFile(document.uri.replace('file://', ''));

            if (!sourceFile) {
                return [];
            }

            const diagnostics = [
                ...program.getSyntacticDiagnostics(sourceFile),
                ...program.getSemanticDiagnostics(sourceFile)
            ];

            return diagnostics.map(diagnostic => {
                const start = sourceFile.getLineAndCharacterOfPosition(diagnostic.start!);
                const end = sourceFile.getLineAndCharacterOfPosition(diagnostic.start! + diagnostic.length!);

                return {
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: start.line, character: start.character },
                        end: { line: end.line, character: end.character }
                    },
                    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
                    source: 'typescript'
                };
            });
        },

        doComplete(document: TextDocument, position: Position): CompletionList {
            const program = getProgram(document);
            const sourceFile = program.getSourceFile(document.uri.replace('file://', ''));

            if (!sourceFile) {
                return { isIncomplete: false, items: [] };
            }

            const offset = sourceFile.getPositionOfLineAndCharacter(
                position.line,
                position.character
            );

            const languageService = createLanguageService(program);
            const info = languageService.getCompletionsAtPosition(
                sourceFile.fileName,
                offset,
                undefined
            );

            if (!info) {
                return { isIncomplete: false, items: [] };
            }

            return {
                isIncomplete: false,
                items: info.entries.map((entry: ts.CompletionEntry) => ({
                    label: entry.name,
                    kind: convertKind(entry.kind),
                    detail: entry.sortText,
                    data: {
                        fileName: sourceFile.fileName,
                        offset
                    }
                }))
            };
        }
    };
}