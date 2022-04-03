
let base = "https://embed.learn-sql.de/include/";

includeCss(base + 'js.webpack/sql-ide-embedded.css');
includeJs(base + "lib/jquery/jquery-3.3.1.js");
includeJs(base + "lib/pako/pako.js");
includeJs(base + "lib/zip.js/zip.min.js");
includeJs(base + "lib/sql.js/sql-wasm.js");
includeJs(base + "js/sqljs-worker/sqljsWorkerTools.js");
includeJs(base + "lib/monaco-editor/dev/vs/loader.js");

window.onload = function () {
    if(window.jo_doc.startsWith("http")){
        $.ajax({
            url: window.jo_doc,
             type:"get",
             dataType:'text',  
             success: function(data){
               initScripts(data);
             },
             error:function() {
               alert("Fehler beim Laden von " + jo_doc);
             }
         });
    } else {
        initScripts(window.jo_doc);
    }
    
};

function initScripts(jo_doc){
    let scriptPosition = jo_doc.indexOf('<script');
    let scripts = jo_doc.substr(scriptPosition);
    let config = jo_doc.substr(0, scriptPosition);
    if (config.indexOf('{') < 0) {
        config = "{}";
    }
    let htmlElement = document.getElementsByTagName('html')[0];
    let bodyElement = document.getElementsByTagName('body')[0];
    /** @type HTMLDivElement */
    let divElement = document.createElement('div');
    divElement.classList.add('sql-online');
    divElement.setAttribute("data-sql-online", config);
    divElement.style.margin = "0 0 0 15px";
    divElement.style.width = "calc(100% - 40px)";
    divElement.style.height = "calc(100% - 45px)";
    divElement.style.top = "15px";
    bodyElement.appendChild(divElement);
    divElement.innerHTML = scripts;
    // document.body.innerHTML = window.jo_doc;
    // divElement = document.getElementsByClassName('java-online')[0];
    htmlElement.style.height = "100%";
    htmlElement.style.margin = "0";
    bodyElement.style.height = "100%";
    bodyElement.style.margin = "0";
    window.javaOnlineDir = base;
    includeJs(base + "js.webpack/sql-ide-embedded.js");

}

function includeJs(src, callback, type) {
    var script = document.createElement('script');
    if (callback) {
        script.onload = function () {
            //do stuff with the script
        };
    }

    if (type) {
        script.type = type;
    }

    script.src = src;

    document.head.appendChild(script);
}

function includeCss(src) {
    var head = document.getElementsByTagName('head')[0];
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = src;
    link.media = 'all';
    head.appendChild(link);
}