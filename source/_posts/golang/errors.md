---
title: '[Golang] 錯誤處理'
date: 2022-01-25 10:02:10
tags: golang
toc: true
# cover: 
---

Golang的Error Handling有以下問題，一直被許多人詬病

1. Error Handling穿插在golang代碼中，造成業務邏輯代碼可讀性受到影響
2. 大量且重複的`if err != nil`無法簡化
3. 簡單的`return err`不能適用所有場景

那麼，到底怎樣才是Golang Error Handling最好作法呢？

<!-- more -->

## 設計思維

### Errors are values

`Errors are values`是Golang創始人之一的Rob Pike對error的設計理念。他認為error和方法的其他返回值一樣，只是多返回值裡面的其中之一，並沒有特別之處。因此，對error的處理就跟對方法其他的返回值一樣處理即可。

### 考慮失敗，而不是成功

在調用任何方法時，都要考慮到它失敗的結果。
> 當方法回傳value和error，不能對這個value有任何假設，必須先判定error。唯一可以忽略error的是你連value都不關心。

### 沒有隱藏的控制流

### 完全交給你控制error

## Error定義

Golang的error如同上面所說的是一個普通的值，翻看源碼為一個簡單的介面。

```golang
// The error built-in interface type is the conventional interface for
// representing an error condition, with the nil value representing no error.
type error interface {
  Error() string
}
```

### 建立Error

在Golang標準庫和許多第三方Go框架中，我們通常使用`errors.New`方法來建立error

```golang
// https://pkg.go.dev/io

var ErrShortWrite = errors.New("short write")

var ErrShortBuffer = errors.New("short buffer")

var EOF = errors.New("EOF")

var ErrUnexpectedEOF = errors.New("unexpected EOF")

var ErrNoProgress = errors.New("multiple Read calls return no data or error")
```

**這裡會有個重點需要注意**: `errors.New()`方法即使創建相同字串內容的error也不是同一個error。為什麼會這樣呢？以下會有詳細說明

```golang
package main

import (
  "errors"
  "fmt"
)

var EOF = errors.New("EOF")

func main() {
  fmt.Println(EOF == errors.New("EOF")) // output: false
}
```

### errors.New()源碼解析

errors.New()源碼:

```golang
package errors

// New returns an error that formats as the given text.
// Each call to New returns a distinct error value even if the text is identical.
func New(text string) error {
  return &errorString{text} // 注意這裡：返回的是&errorString{text}指針，而不是errorString{text}值
}

// errorString is a trivial implementation of error.
type errorString struct {
  s string
}

func (e *errorString) Error() string {
  return e.s
}
```

> 在Golang中，指針的等值是根據記憶體位置。因此，即使兩個errors.New裡的字串內容相同，但等值比較也會回傳`false`

### errors.New()為什麼是回傳指針

我們先來看一個例子，我們模仿`errors.New()`創建一個自定義的錯誤，但與標準庫不同的是，我們自定義錯誤回傳的是值，而不是指針

```golang
type myError struct {
  s string
}

func (me myError) Error() string {
  return me.s
}

func New(text string) error {
  return myError{text} // 這裡返回值，而不是指針
}

var errorA = New("error a")
var errorB = errors.New("error b")

func main() {
  fmt.Println(errorA == New("error a")) // output: true

  fmt.Println(errorB == errors.New("error b")) // output: false
}
```

可以看到我們自定義的`myError`在比對時，只要字串相同就會回傳`true`。

**這時我們就需要想如果字串相同就回傳`true`會有什麼問題?**

> 假設在不同的package定義不同的error，但error裡的字串相同。在進行錯誤比對時，會造成程式誤判，導致進入非預期的錯誤處理流程

## 錯誤類型

### Sentinel Error

預定義的特定錯誤，我們稱為`sentinel error`，然後在調用的時候進行比對判斷。在標準庫與第三方框架大量使用這種方法，例如下方`io`標準庫裡定義的錯誤

```golang
// EOF is the error returned by Read when no more input is available.
// Functions should return EOF only to signal a graceful end of input.
// If the EOF occurs unexpectedly in a structured data stream,
// the appropriate error is either ErrUnexpectedEOF or some other error
// giving more detail.
var EOF = errors.New("EOF")

// ErrUnexpectedEOF means that EOF was encountered in the
// middle of reading a fixed-size block or data structure.
var ErrUnexpectedEOF = errors.New("unexpected EOF")

// ErrNoProgress is returned by some clients of an io.Reader when
// many calls to Read have failed to return any data or error,
// usually the sign of a broken io.Reader implementation.
var ErrNoProgress = errors.New("multiple Read calls return no data or error")
```

進行比對時，我們一般使用`==`或者`errors.Is`進行判斷

```golang
if err == io.EOF {
  // do something
}

if errors.Is(err, io.EOF){
  // do something
}
```

這種錯誤類型有以下缺點

1. 會與調用此錯誤的package形成依賴
2. 將這些錯誤類型當成API暴露給第三方
3. 包含的錯誤訊息十分有限

導致在重構或升級時會很麻煩

### Error type

`Error type`跟我們前面自定義的`myError`一樣實現了`error`介面

```golang
type MyError struct {
  line int
  file string
  s string
}

func (e *MyError) Error() string {
  return fmt.Sprint("%s:%d: %s", e.file, e.line, e.s)
}

func New(file string, line int, s string) error {
  return &MyError{line: line, file: file, s: s}
}
```

然後在外部使用`類型判斷`來判斷是否是此種錯誤類型

```golang
func f() {
  switch err.(type) {
    case *MyStruct:
    // ...
    case others:
    // ...
  }
}
```

這種方式對於`sentinel error`來說，可以包含更詳細的信息。但也會有將此錯誤類型提供給外部的問題，例如標準庫中的`os.PathError`

### Opaque errors

為不透明的錯誤處理，這種方式最大的好處就是**只返回錯誤，暴露錯誤判別介面**，不返回類型

golang [net](https://pkg.go.dev/net#Error)裡的Error

```golang
type Error interface {
  error
  Timeout() bool   // Is the error a timeout?
  Temporary() bool // Is the error temporary?
}

// 錯誤處理
if nerr, ok := err.(net.Error); ok && nerr.Temporary() {
    // 處理
    return
}

if err != nil {

}
```

也可以這樣改寫

```golang
type temporary interface {
  Temporary() bool
}

func IsTemporary(err error) bool {
  te, ok := err.(temporary)
  return ok && te.Temporary()
}
```

這種方式我們可以判斷錯誤**實現了某種特定的行為**，而不是判斷錯誤是某種特定類型或者值。這樣可以減少API的暴露，後續的處理會比較靈活，這樣使用在公用庫會比較好

## Error Handle
