//Mots-composés arbre
const fs = require("fs");
const readline = require("readline")

//Split a string into multiple words, while keeping the splitters
function splitSentence(sentence) {
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

async function main() {
  //Begin Timer
  const start = Date.now();
  const fileStream = fs.createReadStream('MWE.txt', {encoding : "latin1"});
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let tree = {
    "_begin" : {}
  }

  let lineSplitted = "";
  let wordSplitted = "";
  let currentNode = "";

  //TODO : Keep the separator
  //TODO : Switch to regex function
  for await (const line of rl) {
    if(!line.startsWith("//") && (line!="") && (line!=" ")) {
      lineSplitted = line.split(';')
      //lineSplitted[1] will be the whole composed word
      wordSplitted = splitSentence(lineSplitted[1].slice(1,-1))
      currentNode = tree["_begin"];
      for(let word of wordSplitted) {
        if(![" ", ",", ";", ":", "!", "?", "(", ")", "«", "»", "…", '"'].includes(word)) {
          if(!(word in currentNode)) {
            currentNode[word] = {}
          }
          currentNode = currentNode[word]
        }
      }
      //TODO : Replace with shorter keyword for filesize
      currentNode["_d"] = 1;
    }
  }
  fs.writeFileSync(`MWE.json`, JSON.stringify(tree));
  //End Timer
  const end = Date.now();
  console.log(`Execution time : ${end - start} ms`);
}

main()
