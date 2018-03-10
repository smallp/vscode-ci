# PHP intellisense for codeigniter

This extension is developed for codeigniter framework, and it is still under development. Its source is in [GitHub](https://github.com/smallp/vscode-ci).

When there is `system` folder in you workspace, the extension will start and parse the files in your model folder.

If you find any bug or suggestion, please add a issue [here](https://github.com/smallp/vscode-ci/issues).

**Attention**: All the features is based on **RegExp**, so it is limited in some situation.

## Features

### code completion

It can provide code completion for all models and some system classes (include db, input and load).

1. When you hint `$this->`, it will display `db`,`input` and the name of other classes.
2. When you select the class, it will insert the class with '-'. So while you type '>' it will display all the methods of the class.
3. It supports method chaining **only for** `db` class.
4. When you hint `className::`, it will display const and static variables.
5. If you add or delete a model file, you now can use command 'refresh Model' to refresh the model folders.

As for the library, the extension will not parse the file unless you open a file loaded the library. It means when you open a file that include the code `$this->load->library('foo')`, the extension will search for the file and parse it.

### Document Symbol

Pressing F1 in VS Code, and type @. Then you can get all the methods in this file.

### Goto definition

You can goto definition for all the models, libraries, their methods and const variables.

### Hover

You can hover to get a method's documents.

## Known issues
* If there are classes in one file, it may not work well. However, that is a rare situation. So there is no plan to fix it.
* If there is a library that has the same name with a model, the library will be ignored as it is a litter troublesome to diff them.

## Author's words
From now, the extension's all feature has been all done. In the rest of the time, I will only fix bugs for it. Thanks for using.

**Enjoy!**
