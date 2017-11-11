# Change Log

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