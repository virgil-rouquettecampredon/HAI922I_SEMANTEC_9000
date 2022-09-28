//Mots-composés arbre
const fs = require("fs");
const readline = require("readline")
//TODO : Vérifier les caractères, certains ne passent pas

function splitSentence(sentence) {
  //Splitting spaces
  sentence = sentence.split(" ");
  //Splitting sentences with punctuations... manquera les crochets/slash/tirets
  let result = []
  sentence.forEach((item, i) => {
    result = [...result, ...item.split(/([,.:"«»()!?…]+)/)]
  });
  result2 = []
  //Attention aux points de suspension
  let point = 0;
  //Split avec c' / d' / j' / l' / m' / n' / s' / t' / y' et attention à la casse
  result.forEach((item, i) => {
    result2 = [...result2, ...item.split(/([cdjlmnstyCDJLMNSTY]')/)]
  });
  result = []
  for(let el of result2) {
    if(el==".") {
      point++
      result.push(el)
    } else if(point==3) {
      point = 0
      result.pop()
      result.pop()
      result.pop()
      result.push("...")
    } else if (el!=''){
      point = 0
      result.push(el)
    }
  }
  result2 = []
  result.forEach((item, i) => {
    result2 = [...result, ...item.split(/([cdjlmnsty]')/)]
  });
  return result;
}

async function main() {
  //TODO : Change type of input to ANSI
  const fileStream = fs.createReadStream('MWE.txt', {encoding : null});
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

  for await (const line of rl) {
    if(!line.startsWith("//") && (line!="") && (line!=" ")) {
      lineSplitted = line.split(';')
      //lineSplitted[1] will be the whole composed word
      //TODO : Real split same as index.js
      wordSplitted = splitSentence(lineSplitted[1].slice(1,-1))
      currentNode = tree["_begin"];
      for(let word of wordSplitted) {
        if(!(word in currentNode)) {
          currentNode[word] = {}
        }
        currentNode = currentNode[word]
      }
      currentNode["_isDone"] = true;
    }
  }
  fs.writeFileSync(`MWE.json`, JSON.stringify(tree, null, 4));
  const treeLoad = JSON.parse(fs.readFileSync("MWE.json"));
  console.log(treeLoad["_begin"]["mort-né"]);
}

main()
