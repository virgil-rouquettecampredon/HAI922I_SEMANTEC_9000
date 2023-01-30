# HAI922I_SEMANTEC_9000

## Sommaire
* **[Node.js](https://github.com/virgil-rouquettecampredon/HAI922I_SEMANTEC_9000/blob/master/README.md/#user-content-how-to-install-nodejs-on-your-machine)**
* **[Packages install](https://github.com/virgil-rouquettecampredon/HAI922I_SEMANTEC_9000/blob/master/README.md/#user-content-how-to-install-needed-packages-for-run-the-program)**
* **[Running](https://github.com/virgil-rouquettecampredon/HAI922I_SEMANTEC_9000/blob/master/README.md/#user-content-how-to-run-this-program)**


## How to install node.js on your machine
### Windows :
Download the LTS binaries : https://nodejs.org/dist/v16.15.0/node-v16.15.0-x64.msi and install

### Linux :
### /!\ The package inside the default repositories is **OUTDATED**. Only install from the Node.js official repositories /!\
````bash
wget -qO- https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install -y nodejs
````

## How to install needed packages for run the program
Once npm is installed, go into the root of the project and run the following command :
````bash
npm install
````

## How to run this program
You will need to create the composed words tree first. You will need the MWE.txt file from JeuxDeMots (make sure it's saved in the same folder as the script under the name `MWE.txt`. You only need to run this script once, or every time you wish to refresh the list of composed words.
Run the following :
````bash
node create_mwe_tree.js
````
Then simply start the server by running :
````bash
node index.js
````
Finally open the file `index.html` in your browser and you can start querying the program.

## How to write rules
### This tutorial is also available directly on the website in french.
- You must use a space between each operator
- The rules are broken down into two parts, with a "=>" to separate the assumptions and conclusions
- To separate each rule you can use ";"
- To separate assumptions or conclusions you can use "&"
- You can declare a variable with "$x" where x is any character
- You can specify the type of a term or group with "==" ($x == GN or $x == Adj)
- You can negate relationships by prefixing "!" to the relationship (e.g. $x !r_succ $y)
- You can negate typings (of grammatical functions or groups) with "!="
- You can create a group of words with "+" (without spaces) "$x+$y == GN"


## Additional functions
You can delete the cache by deleting the whole folder. It will be recreated the next time you run the program.
