import { Compiler, CompilerStatus } from "../compiler/Compiler.js";
import { Module, File } from "../compiler/parser/Module.js";
import { ActionManager } from "../main/gui/ActionManager.js";
import { BottomDiv } from "../main/gui/BottomDiv.js";
import { Editor } from "../main/gui/Editor.js";
import { ProgramControlButtons } from "../main/gui/ProgramControlButtons.js";
import { RightDiv } from "../main/gui/RightDiv.js";
import { MainBase } from "../main/MainBase.js";
import { Workspace } from "../workspace/Workspace.js";
import { JOScript } from "./EmbeddedStarter.js";
import { makeDiv, makeTabs, openContextMenu } from "../tools/HtmlTools.js";
import { EmbeddedSlider } from "./EmbeddedSlider.js";
import { EmbeddedFileExplorer } from "./EmbeddedFileExplorer.js";
import { TextPosition } from "../compiler/lexer/Token.js";
import { EmbeddedIndexedDB } from "./EmbeddedIndexedDB.js";
import { SemicolonAngel } from "../compiler/parser/SemicolonAngel.js";
import { DatabaseTool } from "../tools/DatabaseTools.js";

type JavaOnlineConfig = {
    withFileList?: boolean,
    withOutput?: boolean,
    withErrorList?: boolean,
    withBottomPanel?: boolean,
    id?: string,
    databaseFilename?: string
}

export class MainEmbedded implements MainBase {
    isEmbedded(): boolean { return true; }

    getCompiler(): Compiler {
        return this.compiler;
    }
    getCurrentWorkspace(): Workspace {
        return this.currentWorkspace;
    }
    getMonacoEditor(): monaco.editor.IStandaloneCodeEditor {
        return this.editor.editor;
    }

    getRightDiv(): RightDiv {
        return this.rightDiv;
    }

    getBottomDiv(): BottomDiv {
        return this.bottomDiv;
    }

    getActionManager(): ActionManager {
        return this.actionManager;
    }

    getCurrentlyEditedModule(): Module {
        if (this.config.withFileList) {
            return this.fileExplorer.currentFile?.module;
        } else {
            return this.currentWorkspace.moduleStore.getFirstModule();
        }
    }

    getDatabaseTool(): DatabaseTool {
        return this.databaseTool;
    }


    config: JavaOnlineConfig;

    editor: Editor;
    programPointerDecoration: string[] = [];
    programPointerModule: Module;

    currentWorkspace: Workspace;
    actionManager: ActionManager;

    compiler: Compiler;

    $runDiv: JQuery<HTMLElement>;

    $debuggerDiv: JQuery<HTMLElement>;

    bottomDiv: BottomDiv;
    $filesListDiv: JQuery<HTMLElement>;

    $hintDiv: JQuery<HTMLElement>;
    $monacoDiv: JQuery<HTMLElement>;
    $resetButton: JQuery<HTMLElement>;

    programIsExecutable = false;
    version: number = 0;

    timerHandle: any;

    rightDiv: RightDiv;
    $rightDivInner: JQuery<HTMLElement>;

    fileExplorer: EmbeddedFileExplorer;

    debounceDiagramDrawing: any;

    indexedDB: EmbeddedIndexedDB;

    compileRunsAfterCodeReset: number = 0;

    semicolonAngel: SemicolonAngel;

    databaseTool: DatabaseTool;

    constructor($div: JQuery<HTMLElement>, private scriptList: JOScript[]) {

        this.readConfig($div);

        this.initGUI($div);

        this.databaseTool = new DatabaseTool();
        if(this.config.databaseFilename != null){
            this.databaseTool.getSQLStatements(this.config.databaseFilename, (sql) => {
                this.databaseTool.initializeWorker(sql, () => {console.log('success!')})
            })
        }

        this.initScripts();

        this.indexedDB = new EmbeddedIndexedDB();
        this.indexedDB.open(() => {

            if (this.config.id != null) {
                this.readScripts();
            }

        });

        this.semicolonAngel = new SemicolonAngel(this);

    }

    initScripts() {

        this.fileExplorer?.removeAllFiles();

        this.initWorkspace(this.scriptList);

        if (this.config.withFileList) {
            this.fileExplorer = new EmbeddedFileExplorer(this.currentWorkspace.moduleStore, this.$filesListDiv, this);
            this.fileExplorer.setFirstFileActive();
            this.scriptList.filter((script) => script.type == "hint").forEach((script) => this.fileExplorer.addHint(script));
        } else {
            this.setModuleActive(this.currentWorkspace.moduleStore.getFirstModule());
        }

    }


    readConfig($div: JQuery<HTMLElement>) {
        let configJson: string | object = $div.data("java-online");
        if (configJson != null && typeof configJson == "string") {
            this.config = JSON.parse(configJson.split("'").join('"'));
        } else {
            this.config = {}
        }

        if (this.config.withFileList == null) this.config.withFileList = true;
        if (this.config.withOutput == null) this.config.withOutput = true;
        if (this.config.withErrorList == null) this.config.withErrorList = true;
        if (this.config.withBottomPanel == null) this.config.withBottomPanel = true;

        if (!(this.config.withOutput || this.config.withFileList || this.config.withErrorList)) {
            this.config.withBottomPanel = false;
        }

        if (!this.config.withBottomPanel) {
            this.config.withFileList = false;
            this.config.withOutput = false;
            this.config.withErrorList = false;
        }


    }

    setModuleActive(module: Module) {

        if (this.config.withFileList && this.fileExplorer.currentFile != null) {
            this.fileExplorer.currentFile.module.editorState = this.getMonacoEditor().saveViewState();
        }

        if (this.config.withFileList) {
            this.fileExplorer.markFile(module);
        }

        /**
         * WICHTIG: Die Reihenfolge der beiden Operationen ist extrem wichtig.
         * Falls das Model im readonly-Zustand gesetzt wird, funktioniert <Strg + .> 
         * nicht und die Lightbulbs werden nicht angezeigt, selbst dann, wenn
         * später readonly = false gesetzt wird.
         */
        this.getMonacoEditor().updateOptions({
            readOnly: false,
            lineNumbersMinChars: 4
        });
        this.editor.editor.setModel(module.model);


        if (module.editorState != null) {
            this.getMonacoEditor().restoreViewState(module.editorState);
        }

    }



    readScripts() {

        let modules = this.currentWorkspace.moduleStore.getModules(false);

        let that = this;

        this.indexedDB.getScript(this.config.id, (scriptListJSon) => {
            if (scriptListJSon == null) {
                setInterval(() => {
                    that.saveScripts();
                }, 1000);
            } else {

                let scriptList: string[] = JSON.parse(scriptListJSon);
                let countDown = scriptList.length;

                for (let module of modules) {
                    that.fileExplorer?.removeModule(module);
                    that.removeModule(module);
                }

                for (let name of scriptList) {

                    let scriptId = this.config.id + name;
                    this.indexedDB.getScript(scriptId, (script) => {
                        if (script != null) {

                            let module = that.addModule({
                                title: name,
                                text: script,
                                type: "sql"
                            });

                            that.fileExplorer?.addModule(module);
                            that.$resetButton.fadeIn(1000);

                            // console.log("Retrieving script " + scriptId);
                        }
                        countDown--;
                        if (countDown == 0) {
                            setInterval(() => {
                                that.saveScripts();
                            }, 1000);
                            that.fileExplorer?.setFirstFileActive();
                            if (that.fileExplorer == null) {
                                let modules = that.currentWorkspace.moduleStore.getModules(false);
                                if (modules.length > 0) that.setModuleActive(modules[0]);
                            }
                        }
                    })

                }

            }


        });


    }

    saveScripts() {

        let modules = this.currentWorkspace.moduleStore.getModules(false);

        let scriptList: string[] = [];
        let oneNotSaved: boolean = false;

        modules.forEach(m => oneNotSaved = oneNotSaved || !m.file.saved);

        if (oneNotSaved) {

            for (let module of modules) {
                scriptList.push(module.file.name);
                let scriptId = this.config.id + module.file.name;
                this.indexedDB.writeScript(scriptId, module.getProgramTextFromMonacoModel());
                module.file.saved = true;
                // console.log("Saving script " + scriptId);
            }

            this.indexedDB.writeScript(this.config.id, JSON.stringify(scriptList));
        }

    }

    deleteScriptsInDB() {
        this.indexedDB.getScript(this.config.id, (scriptListJSon) => {
            if (scriptListJSon == null) {
                return;
            } else {

                let scriptList: string[] = JSON.parse(scriptListJSon);

                for (let name of scriptList) {

                    let scriptId = this.config.id + name;
                    this.indexedDB.removeScript(scriptId);
                }

                this.indexedDB.removeScript(this.config.id);

            }


        });

    }

    initWorkspace(scriptList: JOScript[]) {
        this.currentWorkspace = new Workspace("Embedded-Workspace", this, 0);

        let i = 0;
        for (let script of scriptList) {
            if (script.type == "sql") {
                this.addModule(script);
            }

        }

    }

    addModule(script: JOScript): Module {
        let module: Module = Module.restoreFromData({
            id: this.currentWorkspace.moduleStore.getModules(true).length,
            name: script.title,
            text: script.text,
            text_before_revision: null,
            submitted_date: null,
            student_edited_after_revision: false,
            version: 1,
            workspace_id: 0,
            forceUpdate: false,
            identical_to_repository_version: false,
            file_type: 11,
        }, this);

        this.currentWorkspace.moduleStore.putModule(module);

        let that = this;

        module.model.onDidChangeContent(() => {
            that.considerShowingCodeResetButton();
        });

        return module;
    }

    removeModule(module: Module) {
        this.currentWorkspace.moduleStore.removeModule(module);
    }


    initGUI($div: JQuery<HTMLElement>) {

        // let $leftDiv = jQuery('<div class="joe_leftDiv"></div>');

        $div.css({
            "background-image": "none",
            "background-size": "100%"
        })

        let $centerDiv = jQuery('<div class="joe_centerDiv"></div>');

        let $topDiv = jQuery('<div class="joe_topDiv"></div>');
        $div.append($topDiv);

        let $resetModalWindow = this.makeCodeResetModalWindow($div);

        let $rightDiv = this.makeRightDiv();

        let $editorDiv = jQuery('<div class="joe_editorDiv"></div>');
        this.$monacoDiv = jQuery('<div class="joe_monacoDiv"></div>');
        this.$hintDiv = jQuery('<div class="joe_hintDiv jo_scrollable"></div>');
        this.$resetButton = jQuery('<div class="joe_resetButton jo_button jo_active" title="Code auf Ausgangszustand zurücksetzen">Code Reset</div>');

        $editorDiv.append(this.$monacoDiv, this.$hintDiv, this.$resetButton);

        let $bracketErrorDiv = this.makeBracketErrorDiv();
        $editorDiv.append($bracketErrorDiv);

        $topDiv.append($editorDiv);

        this.$resetButton.hide();

        this.$resetButton.on("click", () => { $resetModalWindow.show(); })

        this.$hintDiv.hide();

        let $controlsDiv = jQuery('<div class="joe_controlsDiv"></div>');
        let $bottomDivInner = jQuery('<div class="joe_bottomDivInner"></div>');


        let $bottomDiv = jQuery('<div class="joe_bottomDiv"></div>');
        this.makeBottomDiv($bottomDivInner, $controlsDiv);
        $bottomDiv.append($bottomDivInner);
        if (this.config.withFileList) {
            let $filesDiv = this.makeFilesDiv();
            $bottomDiv.prepend($filesDiv);
            new EmbeddedSlider($filesDiv, false, false, () => { });
        }
        makeTabs($bottomDivInner);
        $div.append($bottomDiv);

        if (!this.config.withBottomPanel) {
            $centerDiv.prepend($controlsDiv);
            $controlsDiv.addClass('joe_controlPanel_top');
            $editorDiv.css({
                'position': 'relative',
                'height': '1px'
            });
        }

        $div.addClass('joe_javaOnlineDiv');

        this.editor = new Editor(this, false, true);
        this.editor.initGUI(this.$monacoDiv);
        this.$monacoDiv.find('.monaco-editor').css('z-index', '10');

        if ($div.attr('tabindex') == null) $div.attr('tabindex', "0");
        this.actionManager = new ActionManager($div, this);
        this.actionManager.init();

        this.bottomDiv = new BottomDiv(this, $bottomDivInner, $div);
        this.bottomDiv.initGUI();

        this.rightDiv = new RightDiv(this, this.$rightDivInner);
        this.rightDiv.initGUI();

        $topDiv.append($rightDiv);

        let $rightSideContainer = jQuery('<div class="jo_rightdiv-rightside-container"></div>');
        let $infoButton = jQuery('<div class="jo_button jo_active img_ellipsis-dark"></div>');
        $rightSideContainer.append($infoButton);
        this.$rightDivInner.append($rightSideContainer);

        new EmbeddedSlider($rightDiv, true, false, () => {
            this.editor.editor.layout();
        });

        new EmbeddedSlider($bottomDiv, true, true, () => { this.editor.editor.layout(); });

        $infoButton.on('mousedown', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            openContextMenu([{
                caption: "Über die Online-IDE ...",
                link: "https://learnj.de",
                callback: () => {
                    // nothing to do.
                }
            }], ev.pageX + 2, ev.pageY + 2);
        });

        setTimeout(() => {
            this.editor.editor.layout();
            this.compiler = new Compiler(this);
            this.startTimer();
        }, 200);


    }

    makeBracketErrorDiv(): JQuery<HTMLElement> {
        return jQuery(`
        <div class="jo_parenthesis_warning" title="Klammerwarnung!" style="bottom: 55px">
        <div class="jo_warning_light"></div>
        <div class="jo_pw_heading">{ }</div>
        <div title="Letzten Schritt rückgängig" 
            class="jo_pw_undo img_undo jo_button jo_active"></div>
        </div>
        `);
    }

    makeCodeResetModalWindow($parent: JQuery<HTMLElement>): JQuery<HTMLElement> {
        let $window = jQuery(
            `
            <div class="joe_codeResetModal">
            <div style="flex: 1"></div>
            <div style="display: flex">
                <div style="flex: 1"></div>
                <div style="padding-left: 30px;">
                <div style="color: red; margin-bottom: 10px; font-weight: bold">Warnung:</div>
                <div>Soll der Code wirklich auf den Ausgangszustand zurückgesetzt werden?</div>
                <div>Alle von Dir gemachten Änderungen werden damit verworfen.</div>
                </div>
                <div style="flex: 1"></div>
            </div>
            <div class="joe_codeResetModalButtons">
            <div class="joe_codeResetModalCancel jo_button jo_active">Abbrechen</div>
            <div class="joe_codeResetModalOK jo_button jo_active">OK</div>
            </div>
            <div style="flex: 2"></div>
            </div>
        `
        );

        $window.hide();

        $parent.append($window);

        jQuery(".joe_codeResetModalCancel").on("click", () => {
            $window.hide();
        });

        jQuery(".joe_codeResetModalOK").on("click", () => {

            this.initScripts();
            this.deleteScriptsInDB();

            $window.hide();
            this.$resetButton.hide();
            this.compileRunsAfterCodeReset = 1;

        });

        return $window;
    }

    makeFilesDiv(): JQuery<HTMLElement> {


        let $filesDiv = jQuery('<div class="joe_bottomDivFiles jo_scrollable"></div>');

        let $filesHeader = jQuery('<div class="joe_filesHeader jo_tabheading jo_active"  style="line-height: 24px">Dateien</div>');

        this.$filesListDiv = jQuery('<div class="joe_filesList jo_scrollable"></div>');

        $filesDiv.append($filesHeader, this.$filesListDiv);

        return $filesDiv;
    }

    startTimer() {
        if (this.timerHandle != null) {
            clearInterval(this.timerHandle);
        }

        let that = this;
        this.timerHandle = setInterval(() => {

            that.compileIfDirty();

        }, 500);


    }

    compileIfDirty() {

        if (this.currentWorkspace == null) return;

        if (this.currentWorkspace.moduleStore.isDirty() &&
            this.compiler.compilerStatus != CompilerStatus.compiling) {
            try {

                this.compiler.compile(this.currentWorkspace.moduleStore);

                let errors = this.
                    bottomDiv?.errorManager?.showErrors(this.currentWorkspace);

                this.editor.onDidChangeCursorPosition(null); // mark occurrencies of symbol under cursor

                this.version++;

            } catch (e) {
                console.error(e);
                this.compiler.compilerStatus = CompilerStatus.error;
            }

        }

    }
    considerShowingCodeResetButton() {
        this.compileRunsAfterCodeReset++;
        if (this.compileRunsAfterCodeReset == 3) {
            this.$resetButton.fadeIn(1000);
        }
    }

    makeBottomDiv($bottomDiv: JQuery<HTMLElement>, $buttonDiv: JQuery<HTMLElement>) {

        let $tabheadings = jQuery('<div class="jo_tabheadings"></div>');
        $tabheadings.css('position', 'relative');
        let $thRightSide = jQuery('<div class="joe_tabheading-right jo_noHeading"></div>');

        $thRightSide.append($buttonDiv);

        if (this.config.withErrorList) {
            let $thErrors = jQuery('<div class="jo_tabheading jo_active" data-target="jo_errorsTab" style="line-height: 24px">Fehler</div>');
            $tabheadings.append($thErrors);
        }


        if (this.config.withOutput) {
            let $thPCode = jQuery('<div class="jo_tabheading" data-target="jo_resultTab" style="line-height: 24px">Ausgabe</div>');
            $tabheadings.append($thPCode);
        }

        $tabheadings.append($thRightSide);

        $bottomDiv.append($tabheadings);

        let $tabs = jQuery('<div class="jo_tabs jo_scrollable"></div>');

        if (this.config.withErrorList) {
            let $tabError = jQuery('<div class="jo_active jo_scrollable jo_errorsTab"></div>');
            $tabs.append($tabError);
        }


        if (this.config.withOutput) {
            let $tabPCode = jQuery('<div class="jo_scrollable jo_resultTab">Ausgabe...</div>');
            $tabs.append($tabPCode);
        }

        $bottomDiv.append($tabs);

    }

    makeRightDiv(): JQuery<HTMLElement> {

        let $rightDiv = jQuery('<div class="joe_rightDiv"></div>');
        this.$rightDivInner = jQuery('<div class="joe_rightDivInner"></div>');
        $rightDiv.append(this.$rightDivInner);


        let $tabheadings = jQuery('<div class="jo_tabheadings"></div>');
        $tabheadings.css('position', 'relative');
        let $thRun = jQuery('<div class="jo_tabheading jo_active" data-target="jo_db_tree" style="line-height: 24px">DB (Baum)</div>');
        let $thVariables = jQuery('<div class="jo_tabheading jo_console-tab" data-target="jo_db_list" style="line-height: 24px">DB (Liste)</div>');
        $tabheadings.append($thRun, $thVariables);
        this.$rightDivInner.append($tabheadings);

        let $tabs = jQuery('<div class="jo_tabs jo_scrollable"></div>');
        let $vd = jQuery('<div class="jo_tab jo_scrollable jo_editorFontSize jo_db_list">DB-Liste</div>');

        this.$runDiv = jQuery(`<div class="jo_tab jo_scrollable jo_editorFontSize jo_active jo_db_tree">DB-Baum</div>`);

        $tabs.append(this.$runDiv, $vd);
        this.$rightDivInner.append($tabs);

        makeTabs($rightDiv);

        return $rightDiv;
    }

    getSemicolonAngel(): SemicolonAngel {
        return this.semicolonAngel;
    }

}


