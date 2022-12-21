const fs = require("fs");
const readline = require("readline")

//HTTP requests
const axios = require("axios");

//Converting Windows-1252 to UTF-8
const iconv = require('iconv-lite');
const express = require("express");

// Web server
const path = require("path");
const app = express();
const bodyParser = require('body-parser')
const port = process.env.PORT || 3000;
const cors = require("cors");

// Node type
const WORD = 0;
const COMPOSED_WORD = 1;
const PUNCTUATION = 2;
const BEGIN = -1;
const END = -2;

//Read relations.json
const relations = JSON.parse(fs.readFileSync("./relations.json"));

//Create application/json parser
let jsonParser = bodyParser.json()

//Load cache
checkCacheExists();
let cached = JSON.parse(fs.readFileSync("./cache/cached.json"));


console.log("Loading MWE tree...");
let start = process.hrtime();
const MWE = JSON.parse(fs.readFileSync("MWE.json"))
let end = process.hrtime(start);
console.log('Loading tree time: %ds %dms', end[0], end[1] / 1000000);

/**********************************************************************************************************************/
/*                                                  Other functions                                                   */
/**********************************************************************************************************************/

function geometricMean(array) { return Math.pow(array.reduce((a, b) => parseInt(a) * parseInt(b)), 1 / array.length); }

function rootMeanSquare(array) { return Math.sqrt(array.reduce((a, b) => parseInt(a) + parseInt(b) * parseInt(b)) / array.length); }

function mean(array) { return array.reduce((a, b) => parseInt(a) + parseInt(b)) / array.length; }





/**********************************************************************************************************************/
/*                                                Handling words                                                      */
/**********************************************************************************************************************/
/**
 * Check if cache exists, and if not create one
 */
function checkCacheExists() {
    //Check if the folder cache exists
    if (!fs.existsSync("./cache")) {
        fs.mkdirSync("./cache");
    }

    //Check if cached.json exists
    if (!fs.existsSync("./cache/cached.json")) {
        fs.writeFileSync("./cache/cached.json", "[]");
    }
}

/**
 * Return the JSON data for a word, if it exists at all, else throws an Error
 * @param word : The word to search for
 * @returns {JSON} : data for the word
 */
async function getWord(word) {
    //Check if the word is in the cache
    let cachedWord = cached.find(x => x.word === word);

    if (cachedWord) {
        if (cachedWord.state === "PROCESSED") {
            return getWordFromCache(cachedWord.id);
        } else if (cachedWord.state === "HTML") {
            return await getWordFromHTML(fs.readFileSync(`./cache/${cachedWord.id}.html`), cachedWord.id);
        } else if (cachedWord.state === "NOT_EXIST") {
            throw new Error(word + " n'est pas un mot valide");
        } else if (cachedWord.state === "TOOBIG") {
            throw new Error(word + " est trop gros pour être traité par le site");
        }
    } else {
        console.log("'" + word + "' not in cache, fetching from RezoDump");
        return await getWordFromRezoDump(word);
    }
}

/**
 * Return the JSON data cached for a word
 * @param id
 * @returns {JSON} : data for the word
 */
function getWordFromCache(id) {
    return JSON.parse(fs.readFileSync("./cache/" + id + ".json"));
}

async function getWordFromHTML(html, id) {
    let cachedWord = cached.find(x => x.id === id);

    //Save decodedFile
    let jsonData = await readLineByLine(id, cachedWord.word);
    fs.writeFileSync(`./cache/${id}.json`, JSON.stringify(jsonData, null, 4));

    //Set the state to PROCESSED
    cachedWord.state = "PROCESSED";
    // TODO : Might not be correctly written because of async
    fs.writeFileSync("./cache/cached.json", JSON.stringify(cached, null, 4));

    return jsonData;
}

/**
 * Fetch the data for a word from RezoDump and save it in the cache as HTML, or throws an error if it doesn't exist
 * @param word
 * @returns {JSON} : data for the word
 */
async function getWordFromRezoDump(word) {
    //Get the definition from the API with axios in windows-1252
    //Be careful with the URL encoding
    let response = await axios.get(`http://www.jeuxdemots.org/rezo-dump.php?gotermsubmit=Chercher&gotermrel=${word}&rel=`, {
        responseType: 'arraybuffer'
    });
    const decodedData = iconv.decode(response.data, 'windows-1252');

    //Check if word exists
    let errorString = `Le terme '${word}' n'existe pas !`;
    let error = decodedData.match(errorString);
    if (error) {
        cached.push({id: null, word: word, state: "NOT_EXIST"});
        fs.writeFileSync("./cache/cached.json", JSON.stringify(cached, null, 4));
        throw new Error(word + " n'est pas un mot valide");
    } else {
        //Find eid= in the response
        let eid = decodedData.match(/eid=\d+/g);
        //Get the id of the word
        let id = eid[0].split("=")[1];

        //Check if the word isn't too big, contains TOOBIG_USE_DUMP
        //let tooBig = decodedData.match("TOOBIG_USE_DUMP");
        //if (tooBig) {
        //    cached.push({id: id, word: word, state:"TOOBIG"});
        //    fs.writeFileSync("./cache/cached.json", JSON.stringify(cached, null, 4));
        //    throw new Error(word + " est trop gros pour être traité par le site");
        //}

        //Save raw file (in windows-1252)
        fs.writeFileSync(`./cache/${id}.html`, decodedData);
        cached.push({id: id, word: word, state: "HTML"});

        //Save cached.json
        fs.writeFileSync("./cache/cached.json", JSON.stringify(cached, null, 4));

        return await getWordFromHTML(decodedData, id);
    }
}

/**
 * Read a file line by line and return the JSON data
 * @param wordId : the id of the word
 * @param wordString : the word to search for
 * @returns {JSON} : data for the word
 */
async function readLineByLine(wordId, wordString) {
    const fileStream = fs.createReadStream(`./cache/${wordId}.html`);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let reading = "";
    let word = {};
    let lineSplitted = "";
    word.word = wordString;
    word.id = wordId;

    for await (const line of rl) {
        switch (line) {
            case '<def>':
                break;
            case '</def>':
                reading = ""
                break;
            case "// les types de noeuds (Nodes Types) : nt;ntid;'ntname'":
                reading = "nodeType"
                word["nodeType"] = {};
                break;
            case "// les noeuds/termes (Entries) : e;eid;'name';type;w;'formated name' ":
                reading = "nodeTerms";
                word["nodeTerms"] = {};
                break;
            case "// les types de relations (Relation Types) : rt;rtid;'trname';'trgpname';'rthelp' ":
                reading = "relationType";
                word["relationType"] = {};
                break;
            case "// les relations sortantes : r;rid;node1;node2;type;w ":
                reading = "outgoingRelationship";
                word["outgoingRelationship"] = [];
                break;
            case "// les relations entrantes : r;rid;node1;node2;type;w ":
                reading = "ingoingRelationship";
                word["ingoingRelationship"] = [];
                break;
            case "// END":
                reading = "";
                break;
            default:
                if (line !== "") {
                    switch (reading) {
                        case "def":
                            word["definiton"] = line;
                            break;
                        case "nodeType":
                            lineSplitted = line.split(';');
                            word["nodeType"][parseInt(lineSplitted[1])] = lineSplitted[2].slice(1, -1);
                            break;
                        case "nodeTerms":
                            lineSplitted = line.split(";");
                            word["nodeTerms"][parseInt(lineSplitted[1])] = {
                                name: lineSplitted[2].slice(1, -1),
                                type: parseInt(lineSplitted[3]),
                                weight: parseInt(lineSplitted[4]),
                                formattedName: lineSplitted.length > 5 ? lineSplitted[5].slice(1, -1) : null
                            }
                            break;
                        case "relationType":
                            lineSplitted = line.split(";");
                            word["relationType"][parseInt(lineSplitted[1])] = {
                                name: lineSplitted[2].slice(1, -1),
                                gpName: lineSplitted[3].slice(1, -1),
                                consigne: lineSplitted[4]
                            }
                            break;
                        case "outgoingRelationship":
                            lineSplitted = line.split(";");
                            if (lineSplitted.length > 1) {
                                word["outgoingRelationship"].push({
                                    node: parseInt(lineSplitted[3]),
                                    type: parseInt(lineSplitted[4]),
                                    weight: parseInt(lineSplitted[5])
                                });
                            }
                            break;
                        case "ingoingRelationship":
                            lineSplitted = line.split(";");
                            if (lineSplitted.length > 1) {
                                word["ingoingRelationship"].push({
                                    node: parseInt(lineSplitted[2]),
                                    type: parseInt(lineSplitted[4]),
                                    weight: parseInt(lineSplitted[5])
                                });
                            }
                            break;
                        default:
                            break;
                    }
                }
        }
    }
    return word;
}





/**********************************************************************************************************************/
/*                                                  Inferences                                                        */
/**********************************************************************************************************************/

async function findLinkBetweenWords(w1, r, w2) {

    let relationId = relations[r];

    //Retrieve the two words
    let words = [null, null];
    words[0] = await getWord(w1);
    words[1] = await getWord(w2);

    //Check if relation exists in relationType
    if (!(relationId in words[0].relationType) && !(relationId in words[1].relationType)) {
        throw new Error("Il n'y a pas de relation explicite " + r + " entre " + w1 + " et " + w2);
    }

    //Read all outgoing nodes for word1
    let word1 = words[0].outgoingRelationship;
    //Keep only the nodes that are related to the relation

    //Read all ingoing nodes for word2
    let word2 = words[1].ingoingRelationship;

    if (word1 === undefined || word2 === undefined) {
        throw new Error("Le dump est incomplet, abandon");
    }

    let word1filtered = word1.filter(relation => relation.type === relationId);
    let word1filterWeighted = {}
    word1filtered.forEach(relation => {
        word1filterWeighted[relation.node] = relation.weight
    });


    //Keep only the nodes that are related to the relation
    let word2filtered = word2.filter(relation => relation.type === relationId);
    let word2filterWeighted = {}
    word2filtered.forEach(relation => {
        word2filterWeighted[relation.node] = relation.weight
    });

    //Check if the relation exists between the two words
    //w1 relation x new_relation w2
    let a = word2.filter(node => Object.keys(word1filterWeighted).includes(node.node.toString()));
    //Sort by weight
    a.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
    //for(let rel of a) {
    //    console.log(w1 + " " + r + " (" + word1filterWeighted[rel.node] + ") " + words[1].nodeTerms[rel.node].name + " " + words[1].relationType[rel.type].name + " (" + rel.weight + ") " + w2);
    //}
    let interestingRelations1 = {};
    for (let relation of a) {
        if (!(relation.type in interestingRelations1)) {
            interestingRelations1[relation.type] = {
                words: [w1, words[1].nodeTerms[relation.node].name, w2],
                relations: [r, words[1].relationType[relation.type].name],
                weights: [word1filterWeighted[relation.node], relation.weight],
                scoreGeo: geometricMean([word1filterWeighted[relation.node], relation.weight]),
                scoreCube: rootMeanSquare([word1filterWeighted[relation.node], relation.weight]),
                scoreMoy: mean([word1filterWeighted[relation.node], relation.weight])
            };
        }
    }

    //w1 new_relation x relation w2
    let b = word1.filter(node => Object.keys(word2filterWeighted).includes(node.node.toString()));
    //Sort by weight
    b.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
    //for(let rel of b) {
    //    console.log(w1 + " " + words[0].relationType[rel.type].name + " (" + rel.weight + ") " + words[0].nodeTerms[rel.node].name + " " + r + " (" + word2filterWeighted[rel.node] + ") " + w2);
    //}
    let interestingRelations2 = {};
    for (let relation of b) {
        if (!(relation.type in interestingRelations2)) {
            interestingRelations2[relation.type] = {
                words: [w1, words[0].nodeTerms[relation.node].name, w2],
                relations: [words[0].relationType[relation.type].name, r],
                weights: [relation.weight, word2filterWeighted[relation.node]],
                scoreGeo: geometricMean([relation.weight, word2filterWeighted[relation.node]]),
                scoreCube: rootMeanSquare([relation.weight, word2filterWeighted[relation.node]]),
                scoreMoy: mean([relation.weight, word2filterWeighted[relation.node]])
            };
        }
    }

    return [interestingRelations1, interestingRelations2];
}

function prettyPrintRelations(relations) {
    //Turn to array
    let relationsArray = Object.keys(relations).map(key => relations[key]);

    for (let relation of relationsArray) {
        let i = 0;
        while (i < relation.relations.length) {
            process.stdout.write(relation.words[i] + " " + relation.relations[i] + " (" + relation.weights[i] + ") " + relation.words[i + 1] + " & ");
            i++;
        }
        process.stdout.write("(scores : cube = " + relation.scoreCube + " / geo = " + relation.scoreGeo + " / somme = " + relation.scoreMoy + ") \n");
        console.log("");
    }

    return relationsArray;
}

async function executeInference(sentence) {
    //Split the sentence into words
    let words = sentence.split(" ");
    //Check if one of the words is a relation
    let relationsFound = words.filter(word => word in relations);
    if (relationsFound.length === 0) {
        throw new Error("La relation n'existe pas, avez-vous fait une faute d'orthographe ?");
    } else if (relationsFound.length === 1) {
        //Get the words and the relation
        words = sentence.split(relationsFound[0]);
        //Remove spaces for each word
        words = words.map(word => word.trim());

        try {
            let [r1, r2] = await findLinkBetweenWords(words[0], relationsFound[0], words[1]);
            console.log('"' + sentence + '"');
            r1 = prettyPrintRelations(r1);
            r2 = prettyPrintRelations(r2);
            return r1.concat(r2);
        } catch (error) {
            throw new Error(error.message);
        }
    } else {
        throw new Error("Phrase trop longue, veuillez n'inclure qu'une seule relation");
    }
}





class Graph {
    graph = {};
    id = 1; //Used to generate unique ids for nodes, position inside the graph
    constructor(sentence) {
        return (async () => {
            //Start precise timer
            let start = process.hrtime();
            sentence = Graph.splitSentence(sentence);
            let pos = 0; //Position inside the sentence

            this.graph = {0: Node.createBeginNode()};

            let wordPromises = [];

            while (pos < sentence.length) {
                //Handling punctuation
                if ([" ", ",", ";", ":", "!", "?", "(", ")", "«", "»", "…", '"'].includes(sentence[pos])) {
                    wordPromises.push(Node.createNodePunctuation(this.id, sentence[pos], pos));
                } else {
                    //Creating a node from the word
                    wordPromises.push(Node.createNodeWord(this.id, sentence[pos], pos));
                }
                pos += 1;
                this.id += 1;
            }


            //Parallelize the creation of the nodes
            await Promise.all(wordPromises).then((values) => {
                for (let value of values) {
                    this.graph[value[0]] = value[1];
                }
                for (let value of values) {
                    this.id = value[0];
                    //Plugging it to the previous node
                    this.graph[this.id - 1]["link"]["r_succ"] = [{node: this.id, weight: 1}];
                    this.graph[this.id]["link"]["r_pred"] = [{node: this.id - 1, weight: 1}];
                }
            });

            //Plugging the last node to the _END node
            this.id += 1;
            this.graph[this.id] = Node.createEndNode(this.id);
            this.graph[this.id - 1]["link"]["r_succ"] = [{node: this.id, weight: 1}];
            this.graph[this.id]["link"]["r_pred"] = [{node: this.id - 1, weight: 1}];
            this.graph.sentenceLength = this.id - 1;

            await this.addComposedWordsToGraph();

            //End timer
            let end = process.hrtime(start);
            console.log("Time to make the graph : " + end[0] + "s " + end[1] / 1000000 + "ms");

            return this;
        })();
    }

    async addComposedWordsToGraph() {
        //Start precise timer
        let start = process.hrtime();
        //Add the composed words
        let composedWords = await this.findComposedWords();
        let promises = [];
        this.id += 1;
        for (let composedWord of composedWords) {
            promises.push(Node.createNodeComposedWord(this.id, composedWord));
            this.id += 1;
        }

        await Promise.all(promises).then((values) => {
            for (let value of values) {
                this.graph[value[0]] = value[1];
            }
            for (let value of values) {
                this.id = value[0];
                let composedWord = value[1];
                //Plugging it to the previous node
                this.graph[composedWord.pos-1]["link"]["r_succ"].push({node: this.id, weight: 1});
                this.graph[this.id]["link"]["r_pred"] = [{node: composedWord.pos-1, weight: 1}];
                //Plugging it to the next node
                this.graph[composedWord.pos+composedWord.length]["link"]["r_pred"].push({node: this.id, weight: 1});
                this.graph[this.id]["link"]["r_succ"] = [{node: composedWord.pos+composedWord.length, weight: 1}];
            }
        });

        //End timer
        let end = process.hrtime(start);
        console.log("Time to add composed words to the graph : " + end[0] + "s " + end[1]/1000000 + "ms");
    }

    //Return an array of array with sentences and words/composedwords
    async findComposedWords() {
        let posLocal = 0;
        let posGlobal = 0;
        let composedWords = [];
        while(posGlobal<this.graph.sentenceLength) {
            posLocal = posGlobal;
            let currentWord = ""
            let MWE_pos = MWE["_begin"];
            while(this.graph[posLocal].word in MWE_pos && posLocal<=this.graph.sentenceLength) {
                MWE_pos = MWE_pos[this.graph[posLocal].word];
                currentWord += this.graph[posLocal].word;
                if("_d" in MWE_pos) {
                    composedWords.push({word: currentWord, pos: posGlobal, length: posLocal-posGlobal+1});
                }
                posLocal+=1;
            }
            posGlobal+=1;
        }
        return composedWords
    }

    //Split a string into multiple words, while keeping the splitters
    static splitSentence(sentence) {
        //TODO : Check whether JeuxDeMots uses a mix of both … and ... or not
        //Replace ... with …
        sentence = sentence.replace(/\.\.\./g, "…");
        //Split the sentence using the following separators : . , ; : ! ? ( ) " « » … c' d' j' l' m' n' s' t' y' qu'
        //TODO : Use positive match instead of negative to avoid having to remove the empty strings
        let words = sentence.split(/([ .,;:!?()«»…"]|[cdjlmnstyCDJLMNSTY]'|qu')/);
        //Remove empty strings
        words = words.filter(word => word !== "");
        return words;
    }

    //returns all word of kind type
    getWordType(type) {
        let result = []
        for (let node in this.graph) {
            for (let r_pos of this.graph[node].type) {
                if ('r_pos' in r_pos) {
                    if (r_pos.r_pos.startsWith(type)) {
                        result.push(this.graph[node].word)
                    }
                }
            }
        }
        return result;
    }

    getWordRelationWord(relation){
        let result = []
        for (let node in this.graph) {
            for (let link in this.graph[node].link) {
                if (this.graph[node].link[link] == relation) {
                    result.push([this.graph[node].word, this.graph[link].word])
                }
            }
        }
        return result;
    }

    toString() {
        let i = 0
        let reconstructedSentence = this.graph[0].word + " | ";
        while(this.graph[i].nodeType!==END) {
            //Find the node with the highest weight
            i = this.graph[i].link.r_succ.reduce((a, b) => a.weight > b.weight ? a : b).node;
            reconstructedSentence += this.graph[i].word + " | ";
        }
        return reconstructedSentence;
    }
}

class Node {
    static createBeginNode() {
        return {
            word: "_BEGIN",
            link: {},
            type: [],
            pos: 0,
            separator: '',
            nodeTpe : BEGIN
        }
    }

    static createEndNode(pos) {
        return {
            word: "_END",
            link: {},
            type: [],
            pos: pos,
            nodeType : END
        }
    }

    static async createNodeWord(id, word, pos) {
        word = await getWord(word);
        let type = await Node.getRpos(word);

        return [id, {
            word: word.word,
            id: word.id,
            link: {},
            type: type,
            pos: pos,
            nodeType : WORD
        }]
    }

    static async createNodeComposedWord(id, composedWord) {
        let word = await getWord(composedWord.word);
        let type = await Node.getRpos(word);

        return [id, {
            word: composedWord.word,
            id: word.id,
            link: {},
            type: type,
            pos: composedWord.pos,
            length: composedWord.length,
            nodeType : COMPOSED_WORD
        }]
    }

    static async createNodePunctuation(id, punctuation, pos) {
        return [id, {
            word: punctuation,
            pos: pos,
            link: {},
            nodeType: PUNCTUATION
        }]
    }

    static async getRpos(node) {
        let result = []
        for (let r of node.outgoingRelationship) {
            if (r.type == 4) {
                if (r.weight > 0) {
                    result.push({"r_pos": node.nodeTerms[r.node].name, "weight": r.weight});
                } else {
                    result.push({"r_pos<0": node.nodeTerms[r.node].name, "weight": r.weight});
                }
            }
        }
        return result
    }
}



/**
 * Exemple of sentence variable
 * @param sentence
 * $x r_succ $y&$x r_pos NOM&$y r_pos ADJ => $y r_caracc $x; another rules ...
 */
function analyzeRules(sentence) {
    let conclusionRules = [];
    let allRules = [];
    let tableRules = sentence.split(";");
    tableRules.forEach((item, i) => {
        let rule = item.split("=>");
        let condition = rule[0].split("&");
        let oneCondition = [];
        condition.forEach((item, i) => {
            //each condition is stored in a same row that the same index in conclusionRules
            let eachWord = item.split(" ");
            //store anyRules into allRules
            let filteredCondition = eachWord.filter(function (value, index, arr) {
                return value != ''
            });
            oneCondition.push(filteredCondition);
        });
        allRules.push(oneCondition);
        //separe each Rules into allRules
        let conclusion = rule[1].split(" ");
        let filteredConclusion = conclusion.filter(function (value, index, arr) {
            return value != ''
        });
        conclusionRules.push(filteredConclusion);
    });
    return [allRules, conclusionRules];
}

//function that sort the condition of rules, for have in first the condition with the relation r_pos
function sortRules(oneCondtionRules){
    let result = []
    for (let rule of oneCondtionRules){
        if(rule[1] === "r_pos"){
            //We put in first the condition with the relation r_pos
            result.unshift(rule)
        } else {
            //We put in last the condition with the other relation
            result.push(rule)
        }
    }
    return result
}

//Function like interpret Rules in allRules, when one column is true, create in sentenceJson the relation in conclusionRules
function interpretRules(allRules, conclusionRules, sentenceJSON) {
    // for all rules into allRules
    for (let i = 0; i < allRules.length; i++) {
        let isTrue = true;
        // for all conditions into one rule
        let arrayCondition = {};
        let oneCondtionRules = sortRules(allRules[i]);
        for (let j = 0; j < oneCondtionRules.length; j++) {
            //we store in an array all words that satisfy the condition
            if (oneCondtionRules[j][1] === "r_pos") {
                arrayCondition[oneCondtionRules[j][0]] = getWordType(oneCondtionRules[j][2], sentenceJSON);
            }
            else{
                let nameDict = oneCondtionRules[j][0] + oneCondtionRules[j][2];
                arrayCondition[nameDict] = (getWordRelationWord(oneCondtionRules[j][1], sentenceJSON));
            }
        }
        console.log(arrayCondition);
        //we check the set of word where all conditions are true and we do the conclusion for him

        let indexArray = [];

        for (let k = 0; k < nameVariable.length; k++) {
            indexArray.push(0);
        }


    }
    return sentenceJSON;
}

async function main() {
    let sentence = `Tristan s'exclame dans le chat : "Le petit chat roux boit du lait... Il s'assoit, et mange sa nourriture : un poisson-chat. Il n'avait qu'à bien se tenir."`;
    let graph = await new Graph(sentence);
    console.log(graph);

    // let [rules, conclusion] = analyzeRules("$x r_succ $y & $x r_pos NOM & $y r_pos ADJ => $y r_caracc $x; $x r_succ $y => $y r_caracc $x");
    // console.log(getWordType('Adj', await sentenceJSON));

    //let [rules, conclusion] = analyzeRules("$x r_succ $y & $x r_pos Nom & $y r_pos Adj => $y r_caracc $x; $w r_succ $z => $w r_caracc $z");
    //console.log(rules);
    //console.log(sortRules(rules[0]));
    //console.log(sentenceJSON);
    //console.log(getWordType('Adj', sentenceJSON));
    //interpretRules(rules, conclusion, sentenceJSON);
    //console.log(getWordRelationWord('r_succ', await sentenceJSON));
}

main().then(r => console.log("Done"));

/**
 * Outgoing for relationship 4 to find kind of word
 * Thread program to be scalable
 */

// app.use(cors());
//
// app.post("/", jsonParser, (req, res) => {
//     console.log(req.body);
//     console.log(req.body.type);
//     switch(req.body.type) {
//         case "further":
//             console.log("further");
//             console.log(req.body.relation);
//             console.log(req.body.position);
//             searchFurther(req.body.relation, req.body.position).then(relations => {
//                 res.send(relations);
//             }).catch(err => {
//                 console.log(err.error);
//                 res.send({error: err.toString()});
//             });
//             break;
//         case "inference":
//             executeInference(req.body.sentence).then(relations => {
//                 res.send(relations);
//             }).catch(err => {
//                 console.log(err.error);
//                 res.send({error: err.toString()});
//             });
//             break;
//         default:
//             res.send({error : "Unknown type"});
//     }
// });
//
// app.listen(port, () => {
//     console.log("Server started on port " + port);
// });
