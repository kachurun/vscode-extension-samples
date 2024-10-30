import { HTMLDocumentRegions } from '../embeddedSupport';
import { LanguageModelCache } from '../languageModelCache';
import { LanguageMode, Position } from '../languageModes';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TypeScriptLanguageService } from '../services/typescript';

export function getTypescriptMode(
    tsLanguageService: TypeScriptLanguageService,
    documentRegions: LanguageModelCache<HTMLDocumentRegions>
): LanguageMode {
    return {
        getId() {
            return 'typescript';
        },
        doValidation(document: TextDocument) {
            const embedded = documentRegions.get(document).getEmbeddedDocument('typescript');
            return tsLanguageService.doValidation(embedded);
        },
        doComplete(document: TextDocument, position: Position) {
            const embedded = documentRegions.get(document).getEmbeddedDocument('typescript');
            return tsLanguageService.doComplete(embedded, position);
        },
        onDocumentRemoved(_document: TextDocument) { /* nothing to do */ },
        dispose() { /* nothing to do */ }
    };
}