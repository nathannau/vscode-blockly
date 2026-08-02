import * as vscode from 'vscode';
import * as path from 'path';
import { CatalogManager } from './catalog/CatalogManager';
import { filterEntriesForRuntime, composeRuntime } from './catalog/boardFilter';
import { ProjectConfig, resolveActiveEnv, toBoardContext, synthesizeManualProject } from './project/projectConfig';
import { loadProjectConfig } from './project/projectLoader';
import { companionUriFor, readCompanionWorkspace, writeCompanionWorkspace, companionExists } from './sidecar/companion';
import { languageForFile } from './codegen/sourceLanguage';
import { collectUsedBlockTypes } from './project/blockUsage';
import { collectRequirements } from './catalog/requirements';
import { getBackend } from './project/backendRegistry';
import { loadL10nBundle, loadBlockMessages, webviewDataScripts, BlockMessages } from './webviewHtml';

/**
 * Custom editor that opens directly on a source file (main.cpp, sketch.ino, …)
 * via "Open With…". The source file is the generation target; the Blockly
 * workspace lives in a companion `.blk` next to it.
 */
export class BlocksEditorProvider implements vscode.CustomTextEditorProvider {
    public static register(context: vscode.ExtensionContext, catalogManager: CatalogManager): vscode.Disposable {
        const provider = new BlocksEditorProvider(context, catalogManager);
        return vscode.window.registerCustomEditorProvider(BlocksEditorProvider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true },
        });
    }

    private static readonly viewType = 'blocks-editor.editor';

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly catalogManager: CatalogManager
    ) { }

    /**
     * Resolve the project-local `.blocks/` directory for a file in the project.
     * Anchored at the workspace folder containing the file (falling back to the
     * first folder, then the file's own directory) so it matches the other local
     * catalog mechanisms — `gatherLocalCatalogs()` and the catalog tree's
     * `resolveBlocksDir()` — rather than the project config file's directory.
     */
    private resolveBlocksDir(fileUri: vscode.Uri): string {
        const folder = vscode.workspace.getWorkspaceFolder(fileUri);
        const root = folder?.uri.fsPath
            ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            ?? path.dirname(fileUri.fsPath);
        return path.join(root, '.blocks');
    }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
        };
        const locale = vscode.env.language || 'en';
        const l10nBundle = await loadL10nBundle(this.context.extensionUri);
        const blockMessages = await loadBlockMessages(this.context.extensionUri);
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, locale, l10nBundle, blockMessages);

        const sourceUri = document.uri;
        const language = languageForFile(sourceUri.fsPath) || 'cpp';
        const companion = companionUriFor(sourceUri);

        let project: ProjectConfig | undefined;
        let selectedEnv: string | undefined;

        if (!(await companionExists(companion)) && document.getText().trim().length > 0) {
            void vscode.window.showWarningMessage(
                vscode.l10n.t('"{0}" will be overwritten by the code generated from these blocks.', path.basename(sourceUri.fsPath))
            );
        }

        const updateWebview = async () => {
            const workspace = await readCompanionWorkspace(companion);
            webviewPanel.webview.postMessage({ type: 'update', state: workspace });
        };

        let projectLocalEntries: import('./catalog/CatalogTypes').CatalogEntry[] = [];

        const sendCatalog = () => {
            const activeEnv = project ? resolveActiveEnv(project, selectedEnv) : undefined;
            if (activeEnv) {selectedEnv = activeEnv.name;}

            const framework = activeEnv?.framework;
            const runtime = activeEnv && framework ? composeRuntime(framework, language) : undefined;
            const allEntries = [...this.catalogManager.getEntries(), ...projectLocalEntries];
            const entries = activeEnv && runtime
                ? filterEntriesForRuntime(allEntries, toBoardContext(activeEnv), runtime)
                : [];

            webviewPanel.webview.postMessage({
                type: 'init_catalog',
                hasBoard: !!activeEnv,
                framework,
                runtime,
                configType: project?.configType,
                envs: project?.envs.map(e => ({ name: e.name, platform: e.platform, board: e.board, framework: e.framework })) ?? [],
                selectedEnv: activeEnv?.name,
                entries,
            });
        };

        const reloadProject = async () => {
            project = await loadProjectConfig(sourceUri.fsPath);
            // Last-resort fallback: only when the detection chain finds nothing.
            // A real project (even one missing a framework) always wins, so the
            // fallback self-heals once a genuine config appears.
            if (!project) {
                const fb = vscode.workspace
                    .getConfiguration('blocks-editor', sourceUri)
                    .get<string>('fallbackFramework');
                if (fb) {project = synthesizeManualProject(sourceUri.fsPath, fb);}
            }
            if (project) {
                const projectBlocksDir = this.resolveBlocksDir(sourceUri);
                await this.catalogManager.syncRemoteCatalogs(projectBlocksDir);
                projectLocalEntries = await this.catalogManager.loadEntriesFrom(projectBlocksDir);
            } else {
                projectLocalEntries = [];
            }
            sendCatalog();
        };

        const changeCatalogSubscription = this.catalogManager.onDidChangeCatalogs(async () => {
            if (project) {
                const projectBlocksDir = this.resolveBlocksDir(sourceUri);
                projectLocalEntries = await this.catalogManager.loadEntriesFrom(projectBlocksDir);
            }
            sendCatalog();
        });

        const remoteRefreshSubscription = this.catalogManager.onDidRequestRemoteRefresh(async () => {
            if (project) {
                const projectBlocksDir = this.resolveBlocksDir(sourceUri);
                await this.catalogManager.syncRemoteCatalogs(projectBlocksDir, true);
                projectLocalEntries = await this.catalogManager.loadEntriesFrom(projectBlocksDir);
                sendCatalog();
            }
        });

        const iniWatcher = vscode.workspace.createFileSystemWatcher('**/platformio.ini');
        const yamlWatcher = vscode.workspace.createFileSystemWatcher('**/sketch.yaml');
        const appYamlWatcher = vscode.workspace.createFileSystemWatcher('**/app.yaml');
        const onConfigChange = () => { void reloadProject(); };
        iniWatcher.onDidCreate(onConfigChange);
        iniWatcher.onDidChange(onConfigChange);
        iniWatcher.onDidDelete(onConfigChange);
        yamlWatcher.onDidCreate(onConfigChange);
        yamlWatcher.onDidChange(onConfigChange);
        yamlWatcher.onDidDelete(onConfigChange);
        appYamlWatcher.onDidCreate(onConfigChange);
        appYamlWatcher.onDidChange(onConfigChange);
        appYamlWatcher.onDidDelete(onConfigChange);

        const getAutoGenerate = () =>
            vscode.workspace.getConfiguration('blocks-editor').get<boolean>('generateOnChange', true);

        const getShowMinimap = () =>
            vscode.workspace.getConfiguration('blocks-editor').get<boolean>('showMinimap', false);

        const getAnnotate = () =>
            vscode.workspace.getConfiguration('blocks-editor').get<boolean>('annotateGeneratedCode', true);

        const sendMode = () => {
            webviewPanel.webview.postMessage({ type: 'set_mode', autoGenerate: getAutoGenerate() });
        };

        const sendMinimap = () => {
            webviewPanel.webview.postMessage({ type: 'set_minimap', show: getShowMinimap() });
        };

        const sendAnnotate = () => {
            webviewPanel.webview.postMessage({ type: 'set_annotate', annotate: getAnnotate() });
        };

        const configSubscription = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('blocks-editor.generateOnChange')) {sendMode();}
            if (e.affectsConfiguration('blocks-editor.showMinimap')) {sendMinimap();}
            if (e.affectsConfiguration('blocks-editor.annotateGeneratedCode')) {sendAnnotate();}
            // Keep every editor on the same folder in sync when the manual
            // framework fallback changes (same echo pattern as the settings above).
            if (e.affectsConfiguration('blocks-editor.fallbackFramework')) {void reloadProject();}
        });

        const themeSubscription = vscode.window.onDidChangeActiveColorTheme(() => {
            webviewPanel.webview.postMessage({ type: 'theme_changed' });
        });

        webviewPanel.onDidDispose(() => {
            changeCatalogSubscription.dispose();
            remoteRefreshSubscription.dispose();
            iniWatcher.dispose();
            yamlWatcher.dispose();
            appYamlWatcher.dispose();
            configSubscription.dispose();
            themeSubscription.dispose();
        });

        const applyCode = async (code: string, state: unknown) => {
            try {
                await this.writeSource(document, code);
                await this.syncProjectConfig(project, selectedEnv, state, language);
                webviewPanel.webview.postMessage({ type: 'generation_result', ok: true });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                webviewPanel.webview.postMessage({ type: 'generation_result', ok: false, error: msg });
            }
        };

        webviewPanel.webview.onDidReceiveMessage(async e => {
            switch (e.type) {
                case 'ready':
                    await reloadProject();
                    await updateWebview();
                    sendMode();
                    sendMinimap();
                    sendAnnotate();
                    return;
                case 'select_env':
                    selectedEnv = e.env;
                    sendCatalog();
                    return;
                case 'pick_fallback_framework': {
                    // Last-resort: no project was detected. Let the user pick a
                    // framework (the candidate list is derived webview-side from
                    // the supported runtimes) and persist it for this folder.
                    const frameworks: string[] = e.frameworks ?? [];
                    if (!frameworks.length) {return;}
                    const picked = await vscode.window.showQuickPick(frameworks, {
                        placeHolder: vscode.l10n.t('Select the framework for this project'),
                    });
                    if (!picked) {return;}
                    await vscode.workspace.getConfiguration('blocks-editor', sourceUri)
                        .update('fallbackFramework', picked, vscode.ConfigurationTarget.WorkspaceFolder);
                    await reloadProject();
                    return;
                }
                case 'set_generate_mode':
                    // Persist the global setting; onDidChangeConfiguration echoes set_mode
                    // back to every open editor, keeping them in sync.
                    await vscode.workspace.getConfiguration('blocks-editor')
                        .update('generateOnChange', e.autoGenerate === true, vscode.ConfigurationTarget.Global);
                    return;
                case 'change':
                    await writeCompanionWorkspace(companion, e.state);
                    if (typeof e.code === 'string') {
                        await applyCode(e.code, e.state);
                    }
                    return;

                case 'load_error': {
                    const blockType = /Invalid block definition for type:\s*(\S+)/.exec(e.error)?.[1];
                    if (blockType) {
                        vscode.window.showErrorMessage(
                            vscode.l10n.t('Unknown block type "{0}". The .blk file references a block that is not in any loaded catalog. Check that the required catalog is present in the project\'s .blocks/ folder or in blocks-editor.catalogPaths.', blockType)
                        );
                    } else {
                        vscode.window.showErrorMessage(
                            vscode.l10n.t('Failed to load workspace — {0}', e.error)
                        );
                    }
                    return;
                }
                case 'open_url': {
                    const url = e.url;
                    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
                        vscode.env.openExternal(vscode.Uri.parse(url));
                    }
                    return;
                }
                case 'show_docs': {
                    const groups: Array<{ title: string; links: Array<{ label: string; url: string }> }> = e.docs ?? [];
                    if (!groups.length) {return;}

                    const items: (vscode.QuickPickItem & { url?: string })[] = [];
                    for (const group of groups) {
                        items.push({ label: group.title, kind: vscode.QuickPickItemKind.Separator });
                        for (const link of group.links) {
                            items.push({ label: `$(link-external) ${link.label}`, description: link.url, url: link.url });
                        }
                    }

                    const picked = await vscode.window.showQuickPick(items, {
                        placeHolder: vscode.l10n.t('Open documentation…'),
                        matchOnDescription: true,
                    });
                    if (picked && 'url' in picked && typeof picked.url === 'string') {
                        vscode.env.openExternal(vscode.Uri.parse(picked.url));
                    }
                    return;
                }
                case 'dialog_prompt': {
                    const value = await vscode.window.showInputBox({
                        prompt: e.message,
                        value: e.defaultValue ?? '',
                    });
                    webviewPanel.webview.postMessage({
                        type: 'dialog_result', id: e.id,
                        value: value ?? null,
                    });
                    return;
                }
                case 'dialog_confirm': {
                    const pick = await vscode.window.showWarningMessage(
                        e.message, { modal: true }, 'OK',
                    );
                    webviewPanel.webview.postMessage({
                        type: 'dialog_result', id: e.id,
                        value: pick === 'OK',
                    });
                    return;
                }
                case 'dialog_alert': {
                    await vscode.window.showInformationMessage(e.message);
                    webviewPanel.webview.postMessage({
                        type: 'dialog_result', id: e.id,
                        value: undefined,
                    });
                    return;
                }
            }
        });
    }

    /**
     * Sync the project config file with the dependencies required by blocks in use.
     * Dispatches to the appropriate merge strategy based on project type.
     */
    private async syncProjectConfig(
        project: ProjectConfig | undefined,
        selectedEnv: string | undefined,
        state: unknown,
        language: string
    ): Promise<void> {
        const activeEnv = project ? resolveActiveEnv(project, selectedEnv) : undefined;
        if (!project || !activeEnv || !activeEnv.framework) {return;}

        const runtime = composeRuntime(activeEnv.framework, language);
        const projectBlocksDir = this.resolveBlocksDir(vscode.Uri.file(project.configPath));
        const localEntries = await this.catalogManager.loadEntriesFrom(projectBlocksDir);
        const allEntries = [...this.catalogManager.getEntries(), ...localEntries];
        const reqs = collectRequirements(allEntries, collectUsedBlockTypes(state), runtime);

        // Packaging (which files to write, in which format) is the backend's job.
        // The backend reads each file fresh immediately before merging and
        // writing it — see ProjectBackend.sync / the injected readFile below.
        const backend = getBackend(project.configType);
        if (!backend) {return;}

        await backend.sync({
            project,
            activeEnv,
            requirements: reqs,
            readFile: async (absPath) => {
                try {
                    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(absPath));
                    return Buffer.from(bytes).toString('utf8');
                } catch {
                    return undefined;
                }
            },
            writeFile: async (absPath, fileContent) => {
                await vscode.workspace.fs.writeFile(vscode.Uri.file(absPath), Buffer.from(fileContent, 'utf8'));
            },
        });
    }

    private writeSource(document: vscode.TextDocument, code: string) {
        if (document.getText() === code) {return Promise.resolve(true);}
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), code);
        return vscode.workspace.applyEdit(edit);
    }

    private getHtmlForWebview(webview: vscode.Webview, locale: string, l10nBundle: string, blockMessages: BlockMessages): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'));

        return /* html */`
            <!DOCTYPE html>
            <html lang="${locale || 'en'}">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Maker Block Studio</title>
                <style>
                    body, html { margin: 0; padding: 0; height: 100vh; overflow: hidden; display: flex; flex-direction: column; }
                    #toolbar { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--vscode-editorWidget-border, #454545); position: relative; z-index: 100; }
                    #toolbar .spacer { flex: 1; }
                    #toolbar label { font-size: 12px; opacity: 0.8; }
                    .toolbarCheck { display: flex; align-items: center; gap: 4px; font-size: 12px; opacity: 0.8; cursor: pointer; white-space: nowrap; }
                    .toolbarCheck input { margin: 0; cursor: pointer; }
                    #docsBtn[aria-disabled="true"] { opacity: 0.4; cursor: default; }
                    #genSplit { display: inline-flex; align-items: stretch; }
                    /* Custom toolbar tooltip — native title is unreliable through the toolkit's shadow DOM. */
                    #tooltip {
                        position: fixed; z-index: 1000; pointer-events: none;
                        padding: 3px 8px; font-size: 12px; line-height: 1.4; max-width: 320px;
                        background: var(--vscode-editorHoverWidget-background, #252526);
                        color: var(--vscode-editorHoverWidget-foreground, #cccccc);
                        border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
                        border-radius: 3px; box-shadow: 0 2px 8px rgba(0,0,0,0.36);
                        opacity: 0; transition: opacity 0.08s;
                    }
                    #tooltip.visible { opacity: 1; }
                    #genSplit vscode-button#generateBtn::part(control) { border-top-right-radius: 0; border-bottom-right-radius: 0; }
                    #genSplit vscode-button#genCaret::part(control) { border-top-left-radius: 0; border-bottom-left-radius: 0; min-width: 0; padding-left: 6px; padding-right: 6px; }
                    #genMenu {
                        position: absolute; top: 100%; right: 8px; margin-top: 4px; z-index: 200; min-width: 220px;
                        background: var(--vscode-menu-background, var(--vscode-editorWidget-background, #252526));
                        color: var(--vscode-menu-foreground, var(--vscode-foreground, #ccc));
                        border: 1px solid var(--vscode-menu-border, var(--vscode-editorWidget-border, #454545));
                        border-radius: 4px; padding: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.36);
                    }
                    #genMenu[hidden] { display: none; }
                    .genMenuItem { display: flex; align-items: center; gap: 8px; padding: 6px 8px; font-size: 12px; cursor: pointer; border-radius: 3px; }
                    .genMenuItem:hover { background: var(--vscode-menu-selectionBackground, rgba(255,255,255,0.08)); color: var(--vscode-menu-selectionForeground, inherit); }
                    .genMenuItem input { margin: 0; cursor: pointer; }
                    #editorArea { position: relative; flex-grow: 1; width: 100%; }
                    #blocklyDiv { position: absolute; inset: 0; }
                    #emptyState {
                        position: absolute; inset: 0; display: none;
                        flex-direction: column; align-items: center; justify-content: center;
                        text-align: center; padding: 24px; gap: 8px;
                        background: var(--vscode-editor-background, #1e1e1e);
                        color: var(--vscode-editor-foreground, #d4d4d4);
                        font-family: var(--vscode-font-family, sans-serif);
                    }
                    #emptyState.visible { display: flex; }
                    #emptyState .title { font-size: 14px; font-weight: 600; }
                    #emptyState .hint { font-size: 12px; opacity: 0.75; max-width: 420px; }
                    #emptyAction {
                        display: none; margin-top: 8px; padding: 4px 14px; cursor: pointer;
                        font-family: inherit; font-size: 12px; border: none; border-radius: 2px;
                        color: var(--vscode-button-foreground, #fff);
                        background: var(--vscode-button-background, #0e639c);
                    }
                    #emptyAction:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
                    /* Themed keyboard focus for the plain native controls (the
                       browser default ring ignores the theme; the vscode-button web
                       components theme their own focus). */
                    #emptyAction:focus-visible, #autoGenCheck:focus-visible, #secondaryFileCheck:focus-visible {
                        outline: 1px solid var(--vscode-focusBorder, #007fd4); outline-offset: 2px;
                    }
                    #emptyAction.visible { display: inline-block; }

                    .blocklyToolboxCategory[id="toolbox-search-input"] .blocklyTreeRowContentContainer {
                        pointer-events: auto !important;
                    }
                    .blocklyToolboxCategoryContainer[aria-labelledby="toolbox-search-input.label"] {
                        margin: 0; padding: 0;
                    }
                    .blocklyToolboxCategory[id="toolbox-search-input"] {
                        padding: 6px 8px !important;
                        display: flex !important;
                        align-items: center !important;
                    }
                    .blocklyToolboxCategory[id="toolbox-search-input"] .blocklyTreeRowContentContainer {
                        display: flex;
                        align-items: center;
                        width: 100%;
                    }
                    input#toolbox-search-input {
                        width: 100%;
                        padding: 5px 8px;
                        margin: 0;
                        border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.2));
                        border-radius: 3px;
                        background: var(--vscode-input-background, rgba(0,0,0,0.3));
                        color: var(--vscode-input-foreground, inherit);
                        font-size: 12px;
                        font-family: var(--vscode-font-family, sans-serif);
                        outline: none;
                        box-sizing: border-box;
                    }
                    input#toolbox-search-input:focus {
                        border-color: var(--vscode-focusBorder, #007fd4);
                    }
                    input#toolbox-search-input::placeholder {
                        color: var(--vscode-input-placeholderForeground, rgba(255,255,255,0.4));
                    }
                </style>
            </head>
            <body>
                <div id="toolbar">
                    <label id="envLabel" for="envSelect" style="display:none">${vscode.l10n.t('Environment')}</label>
                    <vscode-dropdown id="envSelect" style="display:none"></vscode-dropdown>
                    <label class="toolbarCheck" for="secondaryFileCheck" data-tooltip="${vscode.l10n.t('This file only contributes includes, declarations, and functions to the project — it will not generate its own setup()/loop().')}">
                        <input type="checkbox" id="secondaryFileCheck" />
                        <span>${vscode.l10n.t('Secondary file')}</span>
                    </label>
                    <span class="spacer"></span>
                    <vscode-button id="docsBtn" appearance="icon" aria-disabled="true" aria-label="${vscode.l10n.t('Documentation')}" data-tooltip="${vscode.l10n.t('Documentation')}"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"><path d="M8 3.8c-1.4-.9-3.3-1.2-5.3-.9v8.6c2-.3 3.9 0 5.3.9 1.4-.9 3.3-1.2 5.3-.9V2.9c-2-.3-3.9 0-5.3.9z"/><path d="M8 3.8v8.6"/></svg></vscode-button>
                    <div id="genSplit">
                        <vscode-button id="generateBtn" appearance="secondary" disabled data-tooltip="${vscode.l10n.t('Generate code now')}">${vscode.l10n.t('Generate Code')}</vscode-button>
                        <vscode-button id="genCaret" appearance="secondary" aria-haspopup="true" aria-label="${vscode.l10n.t('Generation options')}" data-tooltip="${vscode.l10n.t('Generation options')}"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4z"/></svg></vscode-button>
                        <div id="genMenu" role="menu" hidden>
                            <label class="genMenuItem">
                                <input type="checkbox" id="autoGenCheck" />
                                <span>${vscode.l10n.t('Generate automatically on change')}</span>
                            </label>
                        </div>
                    </div>
                </div>
                <div id="editorArea">
                    <div id="blocklyDiv"></div>
                    <div id="emptyState">
                        <div class="title">No board detected</div>
                        <div class="hint">Open this file inside a project containing a <code>platformio.ini</code>, <code>sketch.yaml</code>, or <code>app.yaml</code> to load the blocks compatible with your board.</div>
                        <button id="emptyAction" type="button">Select framework…</button>
                    </div>
                </div>
                ${webviewDataScripts({ locale, l10nBundle, blockMessages, scriptUri })}
            </body>
            </html>`;
    }
}
