// todo
// src/main.ts

// Function to create a button and set up the click event
function createButton() {
  // Create a new button element
  const button = document.createElement("button");
  button.textContent = "Click me!";

  // Add a click event listener to the button
  button.addEventListener("click", () => {
    alert("You clicked the button!");
  });

  // Append the button to the body of the document
  document.body.appendChild(button);
}

// Call the function to create the button when the script loads
createButton();
