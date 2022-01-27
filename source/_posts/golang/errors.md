---
title: '[Golang] 錯誤處理'
date: 2022-01-25 10:02:10
tags: golang
toc: true
cover: /images/golang/error/error-cover.jpeg
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

### Eliminate error handling by eliminating errors

詳細可參考The Go Blog: <https://go.dev/blog/errors-are-values>

改寫前

```golang
_, err = fd.Write(p0[a:b])
if err != nil {
    return err
}
_, err = fd.Write(p1[c:d])
if err != nil {
    return err
}
_, err = fd.Write(p2[e:f])
if err != nil {
    return err
}
// and so on
```

改寫後

```golang
type errWriter struct {
  w   io.Writer
  err error
}

func (ew *errWriter) write(buf []byte) {
  if ew.err != nil {
      return
  }
  _, ew.err = ew.w.Write(buf)
}

// 使用時
ew := &errWriter{w: fd}
ew.write(p0[a:b])
ew.write(p1[c:d])
ew.write(p2[e:f])
// and so on
if ew.err != nil {
    return ew.err
}
```

標準庫中的`bufio.Writer`也有這種用法。這種就是將重複的邏輯進行封裝，然後把error進行暫存，接著我們只需要在最後判斷error就行了

### go1.13前的fmt.Errorf

在Go1.13版以前，我們可以透過`fmt.Errorf`包裝一個error類型並返回一個新的error類型

```golang
if err == os.ErrNotExist {
  return fmt.Errorf("xxx.go meet err: %v", err)
}
```

透過`fmt.Errorf`包裝，會將原有的error類型丟失，因此無法使用`==`比較。那如果希望保留error的原始類型，應該如何完成呢？

### go1.13的Error Wrapping

#### Wrap

Go1.13版提出了`Error Wrapping`的概念，透過`fmt.Errorf`的使用來保留error的原始類型，使用範例如下：

```golang
func top() error {
  if err := middle(); err != nil {
    return fmt.Errorf("error wrapper 2 : %w", err)
  }
  return nil
}

func middle() error {
  if err := bottom(); err != nil {
    return fmt.Errorf("error wrapper 1 : %w", err)
  }
  return nil
}

func bottom() error {
  return errors.New("core error")
}
```

不仔細看的話，會以為跟之前的`fmt.Errorf`一樣。這裡的區別是在`%v`和`%w`兩個不同的佔位符。`%w`是Go1.13版本新增的佔位符類型，透過結構體嵌套來紀錄error的原始類型

![Go Error Wrap](/images/golang/error/wrap.png)

#### UnWrap

與`wrap`相對應的是`unwrap`。Go1.13的標準庫`errors`提供了`Unwrap`方法，每調用一次`Unwrap`就能夠拆開一層錯誤類型

```golang
err := top()

for err != nil {
  t.Log(err)
  err = errors.Unwrap(err)
}
// Output
// error wrapper 2 : error wrapper 1 : core error
// error wrapper 1 : core error
// core error
```

![Go Error Unwrap](/images/golang/error/unwrap.png)

### Is和AS

`Is`和`As`是Go1.13 errors包裡提供的兩個核心方法：

1. `Is`與上述的`==`相同

    ```golang
    // Similar to:
    //   if err == ErrNotFound { … }
    if errors.Is(err, ErrNotFound) {
        // something wasn't found
    }
    ```
  
2. `As`用於判斷是否為特定的錯誤類型

    ```golang
    // Similar to:
    //   if e, ok := err.(*QueryError); ok { … }
    var e *QueryError
    // Note: *QueryError is the type of the error.
    if errors.As(err, &e) {
      // err is a *QueryError, and e is set to the error's value
    }
    ```

### pkg/errors

Go1.13版本的Error Wrapping是借鑒社區開源庫: <https://github.com/pkg/errors>。不僅如此，pkg/errors還提供了打印`Error Stack`的功能

1. error源頭使用`errors.New`

    ```golang
    func bottom() error {
      return errors.New("bottom error")
    }
    ```

2. error調用鏈裡使用errors.Wrap

    ```golang
    func top() error {
      if err := middle(); err != nil {
        return errors.Wrap(err, "top error")
      }
      return nil
    }

    func middle() error {
      if err := bottom(); err != nil {
        return errors.Wrap(err, "middle error")
      }
    return nil
   }
   ```

3. 獲取error的RootCause和Error Stack

    ```golang
    func main() {
      fmt.Printf("%+v", errors.Cause(top()))
    }

    // output
    bottom error
    main.bottom
      /Users/wuguohua/Workspace/Go/src/github.com/KevinWu0904/interview/main.go:30
    main.middle
      /Users/wuguohua/Workspace/Go/src/github.com/KevinWu0904/interview/main.go:22
    main.top
      /Users/wuguohua/Workspace/Go/src/github.com/KevinWu0904/interview/main.go:14
    main.main
      /Users/wuguohua/Workspace/Go/src/github.com/KevinWu0904/interview/main.go:10
    runtime.main
      /Users/wuguohua/.gvm/gos/go1.15.8/src/runtime/proc.go:204
    runtime.goexit
      /Users/wuguohua/.gvm/gos/go1.15.8/src/runtime/asm_amd64.s:1374
    Process finished with the exit code 0
    ```

4. 完整代碼

    ```golang
    package main

    import (
      "fmt"
      "github.com/pkg/errors"
    )

    func main() {
      fmt.Printf("%+v", errors.Cause(top()))
    }

    func top() error {
      if err := middle(); err != nil {
        return errors.Wrap(err, "top error")
      }
      return nil
    }

    func middle() error {
      if err := bottom(); err != nil {
        return errors.Wrap(err, "middle error")
      }
      return nil
    }

    func bottom() error {
      return errors.New("bottom error")
    }
    ```

### 小結

+ Sentinel Error與Error Wrapping一起使用
+ 如果需要Error Stack資訊，則推薦使用`pkg/errors`

## Go2 Draft Design

Go2 Error Handling仍處於Proposal階段(尚未定版)，我們先看官方目前所提供的範例

改造前:

```golang
func printSum(a, b string) error {
  x, err := strconv.Atoi(a)
  if err != nil {
    return err
  }
  y, err := strconv.Atoi(b)
  if err != nil {
    return err
  }
  fmt.Println("result:", x + y)
  return nil
}
```

改造後:

```golang
func printSum(a, b string) error {
  handle err { return err }
  x := check strconv.Atoi(a)
  y := check strconv.Atoi(b)
  fmt.Println("result:", x + y)
  return nil
}
```

Go2計畫引入兩個關鍵字`handle`和`check`來簡化error對業務邏輯的分割和大量重複的`if err != nil`

可以看到，改造後的代碼明顯減少，可讀性大大增加。並且handle對最終error進行統一處理，減少重複邏輯

不過，由於Go2尚未發佈，就讓我們拭目以待未來Go2能夠成功簡化error吧！

## Panic

Golang中的`panic`代表著程式中不可恢復的錯誤，例如索引越界、不可恢復的環境問題、stack溢位。使用上有以下幾點需要注意：

1. 在程式啟動時，如果有強依賴的服務故障時，使用`panic`退出
2. 在程式啟動時，如果有配置文件不符合規定時，使用`panic`退出(防禦程序)
3. 其他時候只要不是不可恢復的錯誤，不該使用`panic`應該使用`error`
4. 在程式進入點，例如`gin`需要使用`recover`預防程式退出
5. 在程式中應該避免使用野生的`goroutine`
    i. 如果需要異步任務，應該使用異步`worker`，消息通知的方式進行處理，避免產生大量的`goroutine`
    ii. 如果需要使用`goroutine`時，應該使用統一的方法進行創建，這個方法中會運行`recover`，避免野生`goroutine` `panic`導致主程序退出

```golang
func Go(f func()) {
  go func() {
    defer func() {
      if err := recover(); err != nil {
        log.Printf("panic: %+v", err)
      }
    }()

    f()
  }()
}
```

## 最佳實踐

1. 在我們自定義的方法中，使用`errors.New`或者`errors.Errorf`返回錯誤
  
    ```golang
    func myfun(args []string) error {
      if len(args) < 3 {
        return errors.Errorf("not enouth arguments...")
      }
      return nil
    }
    ``

2. 若調用其他方法，請直接返回錯誤。若需要夾帶訊息，請使用`errors.WithMessage`

    ```golang
    if err != nil {
      // 直接返回
      // return err 
      return errors.WithMessage(err, "xxx")
    }
    ```

3. 如果使用標準庫或其他第三方套件時，請使用`errors.Wrap`保存stack訊息
4. 在程序的進入點或者goroutine進入點，使用`%+v`印出stack訊息

## 總結

此篇文章介紹了Go error的特點與目前最佳實踐。golang error設計可以說是golang的特點也是缺點，相信官方會針對這個問題慢慢提出最佳解法的

## 參考資料

+ <https://lailin.xyz/post/go-training-03.html>
+ <https://www.kevinwu0904.top/blogs/golang-error>
+ <https://go.dev/blog/go1.13-errors>
+ <https://go.googlesource.com/proposal/+/master/design/29934-error-values.md>
