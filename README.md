# LMC Assembly Language Support

This extension offers language support for the Little Man Computer (LMC) assembly language, including syntax highlighting, code completion, and diagnostics.

## Features

- **Syntax Highlighting**: Highlighting for labels, instructions, operands, and comments.
- **Code Completion**: Provides a list of LMC instructions as you type.
- **Diagnostics**: Offers real-time feedback on syntax errors, duplicate labels, undefined references, and operand validations.
- **Code Folding**: You can fold code blocks to focus on specific sections and improve readability.

## Installation

1. **Prerequisites**:
   - Ensure you have [Visual Studio Code](https://code.visualstudio.com/) installed.
   - Node.js should be installed on your machine.

2. **Install the Extension**:
   - Open Visual Studio Code.
   - Navigate to the Extensions view by clicking on the Extensions icon in the Activity Bar or pressing `Ctrl+Shift+X`.
   - Search for "LMC Assembly Language" or visit the [extension page](https://marketplace.visualstudio.com/items?itemName=Jacob-Walton.language-lmc).
   - Click **Install** on the extension developed by Jacob Walton.

3. **Manual Installation**:
   - Clone the repository:

     ```bash
     git clone https://github.com/Jacob-Walton/language-lmc.git
     ```

   - Navigate to the project directory:

     ```bash
     cd language-lmc
     ```

   - Install dependencies:

     ```bash
     npm install
     ```

4. **Packaging and Installing the Extension**:
   - **Install `vsce`** if you haven't already:

     ```bash
     npm install -g vsce
     ```

   - **Package the Extension**:

     ```bash
     vsce package
     ```

     This will generate a `.vsix` file in the project directory.
   - **Install the Extension in Visual Studio Code**:
     - Open Visual Studio Code.
     - Press `Ctrl+Shift+P` to open the Command Palette.
     - Type `Extensions: Install from VSIX...` and select the generated `.vsix` file.

## Usage

1. **Opening LMC Files**:
   - Open any `.lmc` file in Visual Studio Code to activate the extension's features.

2. **Writing Code**:
   - Leverage syntax highlighting and code completion to write LMC assembly code.
   - Diagnostics will alert you to any syntax errors or issues as you type.

3. **Running the Language Server**:
   - The extension uses a language server to provide advanced features. Ensure the server is running by checking the output logs in the **Output** panel.

## Contributing

Contributions are welcome! Please follow these steps to contribute:

1. **Fork the Repository**:
   - Click on the **Fork** button at the top of the repository page.

2. **Clone Your Fork**:

   ```bash
   git clone https://github.com/Jacob-Walton/language-lmc.git
   ```

3. **Create a Branch**:

   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **Commit Your Changes**:

   ```bash
   git commit -m "Add your detailed description of changes"
   ```

5. **Push to Your Fork**:

   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request**:
   - Navigate to the original repository and click on **Compare & pull request**.

Please ensure your code follows the project's coding standards and includes appropriate tests where necessary.

## License

This project is licensed under the [MIT License](LICENSE).
