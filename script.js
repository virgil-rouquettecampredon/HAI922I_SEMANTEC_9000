//When DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    //Get the submit button
    let submit = document.getElementById('submit');
	
    //Add event listener to the submit button
    submit.addEventListener('click', function () {
        //Get the input field
        let sentence = document.getElementById('sentence').value;
		let rules = document.getElementById('rules').value;
        requestAnalysis(sentence, rules);
    });
});

function requestAnalysis(sentence, rules) {
    //Make post request to the local server
    (async () => {
        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: "sentence", sentence: sentence, rules:rules})
        };
        const response = await fetch('http://localhost:3000', requestOptions);
        const data = await response.json();
		console.log(data);

        //Find DOM for output button
        let output = document.getElementById('output');
        let button_dl = document.getElementById('button-dl');

        //Download the JSON file by using the download button
        output.style.visibility = "visible";
        output.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        output.download = "output.json";
        output.click();

        //fillAnalysis(data);
    })();
}