# Change Log

## 0.3.5 (2020/01/08)
* Fix: works fine when model in subfolder. [#35](https://github.com/smallp/vscode-ci/issues/35)
* Feature: allow space between `->` and words. [#36](https://github.com/smallp/vscode-ci/issues/36)

## 0.3.5 (2019/12/16)
* Fix: Correct case in model and library.

## 0.3.4 (2019/11/28)
* The way dealing with case of model now is the same with CI. [#34](https://github.com/smallp/vscode-ci/issues/34)
* Remove the setting `capitalize`.
* `ignoreSymbols` affects more.

## 0.3.3 (2019/11/04)
* Fix bug in complete. [#33](https://github.com/smallp/vscode-ci/issues/33)

## 0.3.2 (2019/10/05)
* Add more debug info. If there are any caught error, the output channal would show more debug info. You can push these info as an issue.  [#31](https://github.com/smallp/vscode-ci/issues/31)
* Enable capitalize. [#16](https://github.com/smallp/vscode-ci/issues/16)
* Add feature: now code completion and definition supports variables.

## 0.3.1(0.2.12) (2019/07/12)
* Add feature: support `$CI` or `$this->CI`. [#19](https://github.com/smallp/vscode-ci/issues/19)
* Try to run `CI: refresh Model` command to figure out if this extension starts.

## 0.2.10 (2018/03/15)
* Fix bug: No more errors. [#15](https://github.com/smallp/vscode-ci/issues/15)
* Keep the setting of model when you refresh the models.

## 0.2.9 (2018/03/09)
* Add config of library. [#11](https://github.com/smallp/vscode-ci/issues/11)
* Enable alias in config. [#14](https://github.com/smallp/vscode-ci/issues/14)

## 0.2.8 (2017/11/17)
* Fix bug: Work fine in windows.

## 0.2.7 (2017/11/15)
* Fix bug: change way get path to adapt windows.

## 0.2.5 (2017/11/12)
* Fix bug: extension crashed.
* Do not load this extension if no system folder.
* Show more info in methods of model.

## 0.2.3 (2017/11/11)
* add support for Multi-root workspaces
* be able to set system and application folders.

## 0.2.2 (2017/7/31)
* fix bug in autoComplete

## 0.2.1 (2017/6/24)
* Class name now becomes case sensitivity. See [#3](https://github.com/smallp/vscode-ci/issues/3).
* Going to definition works fine for `self::`
* Add commend `CI:refresh Model` to refresh the model folder if you add or delete model files.

## 0.2.0 (2017/6/16)
* fix bug in Signature
* add definition for $this->method()

## 0.1.9 (2017/5/4)
* fix bug in goto definition
* Add hover.
* Finish the extension.

## 0.1.6 (2017/4/26)
* fix bug in parsing const

## 0.1.5 (2017/4/26)
* Work fine in `$this->db->query($this->)`
* fix bug in loading loader class.
* Work fine in signature.

## 0.1.4 (2017/4/22)
* Refactor the whole project.
* Add const and static support for `self::`
* Add function hints for `$this->` as VScode still not support this feature.

## 0.1.3 (2017/2/28)
* change to Snippet in autoComplete
* fix bug when there is sub-folder in model

## 0.1.2 (2017/2/15)
* Add setting support.
* code optimize

## 0.1.1 (2017/2/13)
* Add const and static support.

## 0.0.10 (2017/2/11)
* bug fix - Path error in Windows. See [#1](https://github.com/smallp/vscode-ci/issues/1).
* known issue fix - When going to the definition of a class, it can jump to the right position.
* code optimize