# PHP intellisense for codeigniter

This extension is developed for codeigniter framework, and it is still under development. Its source is in [GitHub](https://github.com/smallp/vscode-info-collector).

When there is `system` folder in you workspace, the extension will start and parse the files in your model folder.

If you find any bug or suggestion, please add a issue [here](https://github.com/smallp/vscode-ci/issues).

**Attention**: All the features is based on **RegExp**, so it is limited in some situation.

## features

### code completion

It can provide code completion for all models and some system classes (include db, input and load).

1. When you hint `$this->`, it will display `db`,`input` and the name of other classes.
2. When you select the class, it will insert the class with '-'. So while you type '>' it will display all the methods of the class.
3. It supports method chaining only for **db** class.
4. When you hint `className::`, it will display const and static variables.

As for the library, the extension will not parse the file unless you open a file loaded the library. It means when you open a file that include the code `$this->load->library('foo')`, the extension will search for the file and parse it.

### Document Symbol

Pressing F1 in VS Code, and type @. Then you can get all the methods in this file.

### Goto definition

You can goto definition for all the models, libraries, their methods and const variables.

## Known issues
* No `$this->method()` support. It would be basic language support, so I don't want to do it again.
* If there are classes in one file, it can not work well. However, that is a rare situation. So there is no plan to fix it.
* There is no `library` in setting because as you open a file including `$this->load->library`, the file would be parsed. Add a issue if you believe that is nesessary.
* Cannot go to definition by the class name. As the class name shows with const or statis variables, you can go to the file by the variables.

## Todo:
1. Add the feature of hover.

**Enjoy!**
