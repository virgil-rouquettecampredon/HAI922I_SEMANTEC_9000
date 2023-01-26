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
const GROUP = 3;
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
                    wordPromises.push(Node.createNodePunctuation(this.id, sentence[pos], pos+1));
                } else {
                    //Creating a node from the word
                    wordPromises.push(Node.createNodeWord(this.id, sentence[pos], pos+1));
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
            this.sentenceLength = this.id - 1;

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
        while(posGlobal<this.sentenceLength) {
            posLocal = posGlobal;
            let currentWord = ""
            let MWE_pos = MWE["_begin"];
            while(this.graph[posLocal].word in MWE_pos && posLocal<=this.sentenceLength) {
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
    getWordType(type, nodeList) {
        nodeList = nodeList.map(Number);
        let result = []
        for (let node in nodeList) {
            if (this.graph[node].nodeType === WORD || this.graph[node].nodeType === COMPOSED_WORD || this.graph[node].nodeType === GROUP) {
                for (const [t, w] of Object.entries(this.graph[node].type)) {
                    if(w>=0 && t.startsWith(type)) {
                        result.push(parseInt(node));
                    }
                }
            }
        }
        return result;
    }

    getWordRelationWord(relation, nodeList1, nodeList2) {
        nodeList1 = nodeList1.map(Number);
        nodeList2 = nodeList2.map(Number);
        let result = []
        for (let node of nodeList1) {
            if (relation in this.graph[node].link) {
                for (let nodeFound of this.graph[node].link[relation]) {
                    if (nodeList2.includes(parseInt(nodeFound.node))) {
                        result.push([parseInt(node), parseInt(nodeFound.node)])
                    }
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

    async analyze(rules) {
        //TODO : Adds all links, even if there are duplicates found (in case of refinement of nodes, need to make a choice)
        let hasChanged = true;
        while (hasChanged) {
            hasChanged = false;
            // We apply each rules to the graph
            for (let rule of rules.rules) {
                let currentTuples = {};
                for(let variable of rule.allVariables) {
                    //For each variables in the rule head, we fill them with all possible answers
                    if (!(variable in currentTuples)) {
                        currentTuples[variable] = Object.keys(this.graph).map(Number);
                    }
                }
                // Then we start filtering the words that do no match the rule
                for (let premise of rule.premises) {
                    // For rules of arity 1
                    if (premise.nbVariables === 1) {
                        // For == rules only
                        switch(premise.parts[1]) {
                            case "==":
                                currentTuples[premise.variables[0]] = this.getWordType(premise.parts[2], currentTuples[premise.variables[0]]);
                                break;
                            default:
                                console.log(premise);
                                throw new Error("Only r_pos and equals rules are supported for now");
                        }
                    // For rules of arity 2 or more
                    } else {
                        // For each pair of variables
                        for (let i = 0; i < premise.nbVariables - 1; i++) {
                            let var1 = premise.variables[i];
                            let var2 = premise.variables[i+1];
                            let relation = premise.parts[i+1];
                            if(var1 in currentTuples && var2 in currentTuples) {
                                //console.log(var1 + " " + var2 + " exists");
                                currentTuples[var1 + var2] = this.getWordRelationWord(relation, currentTuples[var1], currentTuples[var2]);
                                // Remove the old tuples
                                delete currentTuples[var1];
                                delete currentTuples[var2];
                            } else if (!(var1 in currentTuples) && (var2 in currentTuples)) {
                                //console.log(var1 + " " + var2 + " var1 doesn't exist");
                                // If var1 is not in the current tuples, it means that it already exists as a merged tuples, so we need to find it
                                //Find the key that contains var1
                                let key = Object.keys(currentTuples).find(key => key.includes(var1));
                                //Get its position in the key
                                let pos = key.indexOf(var1)/2;
                                // Create an array that only contains the pos value of currentTuples[key]
                                let currentTuplesPos = currentTuples[key].map(tuple => tuple[pos]);
                                let result = this.getWordRelationWord(relation, currentTuplesPos, currentTuples[var2]);
                                //For each key of currentTuple[key], if currentTuple[key][i][pos] is in result[i][0], then we add it to currentTuples[var1+var2]
                                currentTuples[key + var2] = [];
                                for(let tuple of currentTuples[key]) {
                                    for(let tupleResult of result) {
                                        if(tuple[pos] == tupleResult[0]) {
                                            let tempTuple = JSON.parse(JSON.stringify(tuple));
                                            tempTuple.splice(pos+1, 0, tupleResult[1])
                                            currentTuples[key + var2].push(tempTuple);
                                        }
                                    }
                                }
                                // Remove the old tuples
                                delete currentTuples[key];
                                delete currentTuples[var2];
                            } else if ((var1 in currentTuples) && !(var2 in currentTuples)) {
                                // If var2 is not in the current tuples, it means that it already exists as a merged tuples, so we need to find it
                                //Find the key that contains var2
                                let key = Object.keys(currentTuples).find(key => key.includes(var2));
                                //Get its position in the key
                                let pos = key.indexOf(var2)/2;
                                // Create an array that only contains the pos value of currentTuples[key]
                                let currentTuplesPos = currentTuples[key].map(tuple => tuple[pos]);
                                let result = this.getWordRelationWord(relation, currentTuples[var1], currentTuplesPos);
                                //For each key of currentTuple[key], if currentTuple[key][i][pos] is in result[i][0], then we add it to currentTuples[var1+var2]
                                currentTuples[var1 + key] = [];
                                for(let tuple of currentTuples[key]) {
                                    for(let tupleResult of result) {
                                        if(tuple[pos] == tupleResult[1]) {
                                            let tempTuple = JSON.parse(JSON.stringify(tuple));
                                            tempTuple.splice(pos+1, 0, tupleResult[0])
                                            currentTuples[var1 + key].push(tempTuple);
                                        }
                                    }
                                }
                                // Remove the old tuples
                                delete currentTuples[key];
                                delete currentTuples[var2];
                            } else {
                                //console.log(var1 + " " + var2 + " doesn't exist");
                                // If both var1 and var2 are not in the current tuples, it means that they already exists as a merged tuples, so we simply need to filter the tuples that don't have our relation
                                //Find the key that contains var1
                                let key1 = Object.keys(currentTuples).find(key => key.includes(var1));
                                //Get its position in the key
                                let pos1 = key1.indexOf(var1)/2;
                                //Find the key that contains var2
                                let key2 = Object.keys(currentTuples).find(key => key.includes(var2));
                                //Get its position in the key
                                let pos2 = key2.indexOf(var2)/2;
                                if(key1 !== key2) {
                                    //If they are not the same key, it means they are not correlated so we are creating a cartesian product of both keys
                                    console.log(key1, key2);
                                    currentTuples[key1 + key2] = [];
                                    for(let tuple1 of currentTuples[key1]) {
                                        for(let tuple2 of currentTuples[key2]) {
                                            currentTuples[key1 + key2].push(tuple1.concat(tuple2));
                                            delete currentTuples[key1];
                                            delete currentTuples[key2];
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                //If we still have multiple unrelated keys in currentTuples, we need to merge them, with a cartesian product
                while(Object.keys(currentTuples).length > 1) {
                    let key1 = Object.keys(currentTuples)[0];
                    let key2 = Object.keys(currentTuples)[1];
                    currentTuples[key1 + key2] = [];
                    for(let tuple1 of currentTuples[key1]) {
                        for(let tuple2 of currentTuples[key2]) {
                            currentTuples[key1 + key2].push(tuple1.concat(tuple2));
                        }
                    }
                    delete currentTuples[key1];
                    delete currentTuples[key2];
                }

                //We prune the redundant array in currentTuples to reduce complexity for new nodes
                let onlyKey = Object.keys(currentTuples)[0];
                currentTuples[onlyKey] = currentTuples[onlyKey].map(JSON.stringify).filter((e,i,a) => i === a.indexOf(e)).map(JSON.parse)


                //Now we apply the conclusions
                //First we find the position of each variable in currentTuple
                let positions = {};
                for(let variable of rule.allVariablesConclusion) {
                    positions[variable] = Object.keys(currentTuples).find(key => key.includes(variable)).indexOf(variable)/2;
                }

                //Then we apply the conclusions
                for(let conclusion of rule.conclusion) {
                    let head = conclusion.parts[0];
                    let operator = conclusion.parts[1];
                    let tail = conclusion.parts[2];
                    let weightModifier = 1;

                    switch (operator) {
                        case "!=":
                            weightModifier = -1;
                        case "==":
                            //Two cases, either we create a type or a new group, if it contains a + we know it's a new group
                            if (head.includes("+")) {
                                let groupVariable = head.split("+");
                                //We need to find the position of the group variable from positions
                                let groupVarPos = [];
                                for (let variable of groupVariable) {
                                    groupVarPos.push([variable, positions[variable]]);
                                }

                                //For each tuple in currentTuples, we create a new node with the group variable as name and the value of the tuple at the position of the group variable
                                for (let tuple of currentTuples[Object.keys(currentTuples)[0]]) {
                                    let newWord = "";
                                    let beginPos = tuple[groupVarPos[0][1]];
                                    let endPos = tuple[groupVarPos[groupVarPos.length - 1][1]];
                                    for (let groupVar of groupVarPos) {
                                        newWord += this.graph[tuple[groupVar[1]]].word;
                                    }

                                    //We check if it exists inside our graph, then inside JDM, and if it doesn't we create it
                                    let node = Object.entries(this.graph).find(node => node[1].word == newWord);
                                    if (node === undefined) {
                                        try {
                                            let jdmWord = await getWord(newWord);
                                            this.id += 1;
                                            let newNode = await Node.createNodeComposedWord(this.id, {
                                                word: newWord,
                                                pos: this.graph[beginPos].pos,
                                                length: this.graph[endPos].pos - this.graph[beginPos].pos
                                            });
                                            //We check if it already contains our type
                                            if (!tail in newNode.type) {
                                                //If it doesn't, we add it
                                                newNode.type[tail] = 1;
                                            }
                                            //We plug it to the next and previous nodes
                                            for(let link in this.graph[beginPos].link) {
                                                if(link=="r_pred") {
                                                    // TODO : Might not be a deep copy
                                                    newNode[1].link["r_pred"] = this.graph[beginPos].link["r_pred"];
                                                }
                                            }
                                            for(let link in this.graph[endPos].link) {
                                                if(link=="r_succ") {
                                                    // TODO : Might not be a deep copy
                                                    newNode[1].link["r_succ"] = this.graph[endPos].link["r_succ"];
                                                }
                                            }
                                            this.graph.push(newNode[1]);
                                        } catch (e) {
                                            this.id += 1;
                                            let newNode = await Node.createNodeGroup(this.id, newWord, tail, this.graph[beginPos].pos, this.graph[endPos].pos);
                                            this.graph[this.id] = newNode[1];
                                            //We plug it to the next and previous nodes
                                            for(let link in this.graph[beginPos].link) {
                                                if(link=="r_pred") {
                                                    // TODO : Might not be a deep copy
                                                    newNode[1].link["r_pred"] = this.graph[beginPos].link["r_pred"];
                                                }
                                            }
                                            for(let link in this.graph[endPos].link) {
                                                if(link=="r_succ") {
                                                    // TODO : Might not be a deep copy
                                                    newNode[1].link["r_succ"] = this.graph[endPos].link["r_succ"];
                                                }
                                            }
                                        }
                                    } else {
                                        let nodeId = node[0];
                                        // If it exists, we check if it's the same one, if not we create a new one
                                        if (this.graph[nodeId].pos === beginPos) {
                                            //We check if it already contains our type
                                            if (!tail in this.graph[nodeId].type) {
                                                //If it doesn't, we add it
                                                this.graph[nodeId].type[tail] = 1;
                                            }
                                        } else {
                                            let jdmWord = await getWord(newWord);
                                            this.id += 1;
                                            let newNode = await Node.createNodeComposedWord(this.id, {
                                                word: newWord,
                                                pos: this.graph[beginPos].pos,
                                                length: this.graph[endPos].pos - this.graph[beginPos].pos
                                            });
                                            if (!tail in newNode.type) {
                                                //If it doesn't, we add it
                                                newNode.type[tail] = 1;
                                            }
                                            //We plug it to the next and previous nodes
                                            for(let link in this.graph[beginPos].link) {
                                                if(link=="r_pred") {
                                                    // TODO : Might not be a deep copy
                                                    newNode[1].link["r_pred"] = this.graph[beginPos].link["r_pred"];
                                                }
                                            }
                                            for(let link in this.graph[endPos].link) {
                                                if(link=="r_succ") {
                                                    // TODO : Might not be a deep copy
                                                    newNode[1].link["r_succ"] = this.graph[endPos].link["r_succ"];
                                                }
                                            }
                                            this.graph.push(newNode[1]);
                                        }
                                    }
                                }
                            } else {
                                for(let tuple of currentTuples[Object.keys(currentTuples)[0]]) {
                                    let node = this.graph[tuple[positions[head]]];
                                    if(!(tail in node.type)) {
                                        node.type[tail] = weightModifier;
                                    } else {
                                        if(weightModifier==-1) {
                                            node.type[tail] = weightModifier;
                                        }
                                    }
                                }
                            }
                            break;
                        default:
                            //We create new links between nodes with this kind of rules
                            let w = 1;
                            if(operator.includes("!")) {
                                operator = operator.replace("!", "");
                                w = -1;
                            }

                            for(let tuple of currentTuples[Object.keys(currentTuples)[0]]) {
                                console.log(head);
                                let linkHead = this.graph[tuple[positions[head]]].link;
                                let linkTail = this.graph[tuple[positions[tail]]].link;

                                if(!(operator in linkHead)) {
                                    linkHead[operator] = [];
                                    linkHead[operator].push({
                                        node: tuple[positions[tail]],
                                        weight: w
                                    });
                                } else {
                                    let link = linkHead[operator].find(link => link.node == tuple[positions[tail]]);
                                    if(link === undefined) {
                                        linkHead[operator].push({
                                            node: tuple[positions[tail]],
                                            weight: w
                                        });
                                    } else {
                                        link.weight = w;
                                    }
                                }
                                if(!(operator+">0" in linkTail)) {
                                    linkTail[operator+">0"] = [];
                                    linkTail[operator+">0"].push({
                                        node: tuple[positions[head]],
                                        weight: w
                                    });
                                } else {
                                    let link = linkTail[operator+">0"].find(link => link.node == tuple[positions[head]]);
                                    if(link === undefined) {
                                        linkTail[operator+">0"].push({
                                            node: tuple[positions[head]],
                                            weight: w
                                        });
                                    } else {
                                        link.weight = w;
                                    }
                                }
                            }
                    }
                }
            }
        }
    }
}

class Node {
    static createBeginNode() {
        return {
            word: "_BEGIN",
            link: {},
            pos: 0,
            nodeType : BEGIN
        }
    }

    static createEndNode(pos) {
        return {
            word: "_END",
            link: {},
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

    static async createNodeGroup(id, word, type, begin, end) {
        let typeObj = {}
        typeObj[type] = 1;

        return [id, {
            word: word,
            link: {},
            type: typeObj,
            pos: begin,
            length: end-begin,
            nodeType: GROUP
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
        let arrayRpos = [];
        let setRpos = new Set();
        for (let r of node.outgoingRelationship) {
            if (r.type == 4) {
                //TODO : Ici on suppose qu'il n'y a qu'un seul poids par rpos possible
                result[node.nodeTerms[r.node].name] = r.weight;
            }
        }
        return result
    }
}


class Rule {
    constructor(rules) {
        this.rulesString = rules;
        this.rules = [];

        let arrayRules = rules.split(";");
        for (let rule of arrayRules) {
            //Split the rule into its parts
            let ruleParts = rule.split("=>");
            let premises = this.sortPremise(ruleParts[0].split('&'));
            //For each premise, transform the string into an object, containing the string, the array of variables and the number of variables
            premises = premises.map(premise => {
                let variables = Rule.getVariables(premise);
                return {
                    parts: premise.split(" ").filter(part => part !== ""),
                    variables: variables,
                    nbVariables: variables.length
                }
            });
            //Make a set of all the variables in the premises
            let variables = new Set();
            for (let premise of premises) {
                for (let variable of premise.variables) {
                    variables.add(variable);
                }
            }
            let conclusion = ruleParts[1].split('&');
            //For each conclusion, transform the string into an object, containing the string, the array of variables and the number of variables
            conclusion = conclusion.map(conclusion => {
                let variables = Rule.getVariables(conclusion);
                return {
                    parts: conclusion.split(" ").filter(part => part !== ""),
                    variables: variables,
                    nbVariables: variables.length
                }
            });
            //Make a set of all the variables in the conclusion
            let variablesConclusion = new Set();
            for (let conclu of conclusion) {
                for (let variable of conclu.variables) {
                    variablesConclusion.add(variable);
                }
            }
            this.rules.push({premises: premises, conclusion: conclusion, allVariables: Array.from(variables), allVariablesConclusion: Array.from(variablesConclusion), rulesString: ruleParts[0], conclusionString: ruleParts[1]});
        }
    }

    //Sort premises by arity and ==
    sortPremise(premise) {
        //For each rule we figure out how many variables it has (start by $)
        premise.sort((a, b) => {
            let nbVariablesA = a.split("$");
            let nbVariablesB = b.split("$");
            if (nbVariablesA.length > nbVariablesB.length) {
                return 1;
            } else if (nbVariablesA.length < nbVariablesB.length) {
                return -1;
            } else {
                //Check if the rule includes ==
                if (a.includes("==")) {
                    return 1;
                } else if (b.includes("==")) {
                    return -1;
                } else {
                    return 0;
                }
            }
        });
        return premise;
    }

    static getVariables(premise) {
        let variables = [];
        premise.split(" ").forEach(word => {
            word.split("+").forEach(word => {
                if(word.startsWith("$") && !variables.includes(word)) {
                    variables.push(word);
                }
            });
        });
        return variables;
    }
}

async function main() {
    //let sentence = `Tristan s'exclame dans le chat : "Le petit chat roux boit du lait... Il s'assoit, et mange sa nourriture : un poisson-chat. Il n'avait qu'à bien se tenir."`;
    let sentence = "le chat rouge";
    let graph = await new Graph(sentence);
    //console.log(JSON.stringify(graph, null, 4))
    //console.dir(graph, { depth: null })


    let rules1 = new Rule("$x r_pred $y & $y r_pred $z & $x == Nom & $z == Adj => $x r_caracc $z; $x r_succ $y => $y r_succ<0 $x");
    //let rules2 = new Rule("$x r_succ $y & $x == Nom & $y == Adj => $y r_caracc $x; $w r_succ $z => $w r_caracc $z");
    //Create new nodes as conclusion
    let rules3 = new Rule('$x == Det & $y == Nom && $z == Adj & $x r_succ $a & $a r_succ $y & $y r_succ $b & $b r_succ $z => $x+$a+$y == GNDET: & $x+$a+$y+$b+$z == GN: & $y r_qualifie $z & $y !r_instrument $z & $z != INSTRUMENT:');
    let rules4 = new Rule('$x == Det => $x == DETERMINANT:');

    await graph.analyze(rules3);
    //console.log(JSON.stringify(graph, null, 4))
    console.dir(graph, { depth: null })
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
