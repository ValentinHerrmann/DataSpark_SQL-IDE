import { WorkspaceData } from "../communication/Data.js";
import { Module, ModuleStore } from "../compiler/parser/Module.js";
import { AccordionElement } from "../main/gui/Accordion.js";
import { Main } from "../main/Main.js";


export class Workspace {
    
    name: string;
    id: number;
    owner_id: number;

    version: number;
    // published_to 0: none; 1: class; 2: school; 3: all
    published_to: number;
    
    repository_id: number;    // id of repository-workspace
    has_write_permission_to_repository: boolean; // true if owner of this working copy has write permission to repository workspace

    moduleStore: ModuleStore;
    panelElement: AccordionElement;
    currentlyOpenModule: Module;
    saved: boolean = true;

    compilerMessage: string;

    sql_baseDatabase: string;
    sql_manipulateDatabaseStatements: string;
    sql_history: string;

    constructor(name: string, private main: Main, owner_id: number){
        this.name = name;
        this.owner_id = owner_id;
        this.moduleStore = new ModuleStore(main);
        this.sql_baseDatabase = "";
        this.sql_manipulateDatabaseStatements = "";
        this.sql_history = "";
    }
    
    getWorkspaceData(withFiles: boolean): WorkspaceData {
        let wd: WorkspaceData = {
            name: this.name,
            id: this.id,
            owner_id: this.owner_id,
            currentFileId: this.currentlyOpenModule == null ? null : this.currentlyOpenModule.file.id,
            files: [],
            version: this.version,
            repository_id: this.repository_id,
            has_write_permission_to_repository: this.has_write_permission_to_repository,
            language: 1,
            sql_baseDatabase: this.sql_baseDatabase,
            sql_manipulateDatabaseStatements: this.sql_manipulateDatabaseStatements,
            sql_history: this.sql_history
        }

        if(withFiles){
            for(let m of this.moduleStore.getModules(false)){
    
                wd.files.push(m.getFileData(this));
    
            }
        }

        return wd;
    }


    renderSynchronizeButton(panelElement: AccordionElement) {
        let $buttonDiv = panelElement?.$htmlFirstLine?.find('.jo_additionalButtonRepository');
        if ($buttonDiv == null) return;
        
        let that = this;
        let myMain: Main = <Main>this.main;

        if (this.repository_id != null && this.owner_id == myMain.user.id) {
            let $button = jQuery('<div class="jo_startButton img_open-change jo_button jo_active" title="Workspace mit Repository synchronisieren"></div>');
            $buttonDiv.append($button);
            let that = this;
            $button.on('mousedown', (e) => e.stopPropagation());
            $button.on('click', (e) => {
                e.stopPropagation();

                that.synchronizeWithRepository();

            });

        } else {
            $buttonDiv.find('.jo_startButton').remove();
        }
    }

    synchronizeWithRepository(){
        let myMain: Main = <Main>this.main;
        if(this.repository_id != null && this.owner_id == myMain.user.id){
            myMain.networkManager.sendUpdates(() => {

            }, true);
        }
    }

    static restoreFromData(ws: WorkspaceData, main: Main): Workspace {

        let w = new Workspace(ws.name, main, ws.owner_id);
        w.id = ws.id;
        w.owner_id = ws.owner_id;
        w.version = ws.version;
        w.repository_id = ws.repository_id;
        w.has_write_permission_to_repository = ws.has_write_permission_to_repository;
        w.sql_baseDatabase = ws.sql_baseDatabase;
        w.sql_manipulateDatabaseStatements = ws.sql_manipulateDatabaseStatements;
        w.sql_history = ws.sql_history;

        for(let f of ws.files){

            let m: Module = Module.restoreFromData(f, main);
            w.moduleStore.putModule(m);

            if(f.id == ws.currentFileId){
                w.currentlyOpenModule = m;
            }

        }

        return w;

    }

    hasErrors(): boolean {
        
        return this.moduleStore.hasErrors();
        
    }

    getModuleByMonacoModel(model: monaco.editor.ITextModel): Module {
        for(let m of this.moduleStore.getModules(false)){
            if(m.model == model){
                return m;
            }
        }
        
        return null;
    }
}

