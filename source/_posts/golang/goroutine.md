---
title: '[Golang] Goroutine'
date: 2022-02-07 03:51:01
tags: golang
toc: true
cover: /images/golang/goroutine.jpeg
---

在Golang中使用簡單的`go`關鍵字開啟一個goroutine，但這樣可能會造成開啟過多的goroutine，造成一些無可避免的bug。以下內容會針對golang使用goroutine的一些注意事項

<!-- more -->

## 常見例子

我們很常看見以下例子，就讓我們看看這樣會有什麼問題吧

```golang
func serveApp() {
  go func() {
    mux := http.NewServeMux()
    mux.HandleFunc("/", func(resp http.ResponseWriter, req *http.Request) {
      fmt.Fprintln(resp, "Hello World!")
    })
    if err := http.ListenAndServe(":8080", mux); err != nil {
      log.Fatal(err)
    }
  }()
}

func serveDebug() {
  go http.ListenAndServe(":8081", nil)
}

func main() {
  serveApp()

  serveDebug()

  select {} // 空的select會阻塞
}
```

## Leave concurrency to the caller

請將是否併發的選擇權交給調用者，而不是自己默默加上`goroutine`，不然這樣調用者不知道調用的函數裡使用goroutine

```golang
func serveApp() {
  mux := http.NewServeMux()
  mux.HandleFunc("/", func(resp http.ResponseWriter, req *http.Request) {
    fmt.Fprintln(resp, "Hello World!")
  })
  if err := http.ListenAndServe(":8080", mux); err != nil {
    log.Fatal(err)
  }
}

func serveDebug() {
  http.ListenAndServe(":8081", http.DefaultServeMux)
}

func main() {

  go serveDebug()

  go serveApp()

  select {} // 空的select會阻塞
}
```

## Keep yourself busy or do the work yourself

如果你的 goroutine 無法明確取得進展，這樣通常需要自己做而不是委託給 goroutine 。

```golang
func serveApp() {
  mux := http.NewServeMux()
  mux.HandleFunc("/", func(resp http.ResponseWriter, req *http.Request) {
    fmt.Fprintln(resp, "Hello World!")
  })
  if err := http.ListenAndServe(":8080", mux); err != nil {
    log.Fatal(err)
  }
}

func serveDebug() {
  http.ListenAndServe(":8081", http.DefaultServeMux)
}

func main() {

  go serveDebug()
  
  serveApp()
}
```

這樣消除了將結果從 goroutine 返回到其發起者所需的大量狀態跟踪和通道操作。

## Never start a goroutine without knowning when it will stop

上面的修改還是存在一些問題，當serveDebug發生中斷時，main並不會知道
我們使用`channel`進行改寫通知，詳細代碼如下

```golang
// 啟動一個http服務
func server(handler http.Handler, addr string, stop <-chan struct{}) error {
  s := http.Server{
    Handler: handler,
    Addr:    addr,
  }

  // 我們可以控制這個goroutine退出，只要 stop 這個 channel close或寫入數據，這裡就會退出
  // 同時也調用 s.Shutdown，server這個func調用的http服務也會優雅下線
  go func() {
    <-stop
    log.Printf("server will exiting, addr: %s", addr)
    s.Shutdown(context.Background())
  }()

  return s.ListenAndServe()
}

func serveApp(stop <-chan struct{}) error {
  mux := http.NewServeMux()
  mux.HandleFunc("/", func(resp http.ResponseWriter, req *http.Request) {
    fmt.Fprintln(resp, "Hello World!")
  })

  return server(mux, ":8080", stop)
}

func serveDebug(stop <-chan struct{}) error {
  go func() {
    server(http.DefaultServeMux, ":8001", stop)
  }()
  // 這邊模擬debug服務退出
  time.Sleep(5 * time.Second)
  return fmt.Errorf("mock debug exit")
}

func main() {
  // 用於監聽服務是否有錯誤
  done := make(chan error, 2)
  // 用於控制其他的服務退出，只要其中有一個服務退出，其他服務跟著退出
  stop := make(chan struct{}, 2)

  go func() {
    done <- serveDebug(stop)
  }()

  go func() {
    done <- serveApp(stop)
  }()

  // 用於判斷當前服務是否停止的狀態
  var stopped bool
  // 循環讀取done這個channel
  // 只要有一個錯誤，我們就關閉stop這個channel
  for i := 0; i < cap(done); i++ {
    if err := <-done; err != nil {
      log.Printf("server exit err: %+v", err)
    }
    if !stopped {
      stopped = true
      close(stop)
    }
  }
}
```

> close(chan)的時候，channel還可以讀取，但不能寫入

測試結果

```bash
2022/02/11 11:32:40 server exit err: mock debug exit
2022/02/11 11:32:40 server will exiting, addr: :8001
2022/02/11 11:32:40 server will exiting, addr: :8080
2022/02/11 11:32:40 server exit err: http: Server closed
```

## goroutine leak

goroutine leak顧名思義就是goroutine一直佔用著資源，無法退出

### 造成原因

大部分的goroutine leak通常是`sync`、`channel`操作不當造成的，而且調用方無法控制此 goroutine 退出的方法
> `sync`、`channel`造成 goroutine leak具體內容會在後續文章繼續探討

簡單的範例： 

```golang
func main() {
  // 計算剛開始的 goroutine 數量
  startingGs := runtime.NumGoroutine()

  leak()

  // 暫停一秒觀察leak()停止後的狀況
  time.Sleep(time.Second)

  // 計算結束後的 goroutine 數量
  endingGs := runtime.NumGoroutine()

  fmt.Println("Number of goroutines before: ", startingGs)
  fmt.Println("Number of goroutines after: ", endingGs)
  fmt.Println("Number of goroutines leaked: ", endingGs-startingGs)
}

// 此方法模擬當 channel 一直沒有值進來
// 此 goroutine 會一直阻塞
func leak() {
  ch := make(chan int)

  go func() {
    fmt.Println("We received a value: ", <-ch)
  }()
}
```

## Incomplete Work

當我們程序中止時，並未等 goroutine 完成它應該完成的工作(非 main goroutine)，就會發生`Incomplete work`

可以執行以下程式，看看會有什麼結果

```golang
func main() {
  fmt.Println("Hello")
  go fmt.Println("Goodbye")
}
```

可以發現console只有印出`Hello`，並沒有等待`Goodbye`印出再退出程序

### 這樣會產生什麼問題

這樣的方式有可能讓我們在寫檔或寫入資料庫時，造成資料遺漏問題

### 如何預防

以下讓我們看一個模擬web trace服務

```golang
type Tracker struct {
}

func (t *Tracker) Event(data string) {
  time.Sleep(time.Second)
  fmt.Println(data)
}

type App struct {
  tracker Tracker
}

func (a *App) Handle(text string) {
  fmt.Println(text + " App.Handle()")

  go a.tracker.Event(text + " Tracker.Event()")
}

func main() {
  var a App

  a.Handle("1")
  a.Handle("2")
}
```

執行結果:

```bash
1 App.Handle()
2 App.Handle()
```

#### 方法一: 使用 sync.WaitGroup 改寫

我們可以使用`sync.WaitGroup`來追蹤每一個創建的 goroutine

```golang
type Tracker struct {
  wg sync.WaitGroup
}

func (t *Tracker) Event(data string) {
  t.wg.Add(1)

  go func() {
  //
    defer t.wg.Done()

    time.Sleep(time.Second)
    fmt.Println(data)
  }()
}

func (t *Tracker) Showdown() {
  t.wg.Wait()
}

type App struct {
  tracker Tracker
}

func (a *App) Handle(text string) {
  fmt.Println(text + " App.Handle()")

  a.tracker.Event(text + " Tracker.Event()")
}

func main() {
  var a App
  a.Handle("1")
  a.Handle("2")

  a.tracker.Showdown()
}
```

執行結果

```bash
1 App.Handle()
2 App.Handle()
2 Tracker.Event()
1 Tracker.Event()
```

#### 方法二: 設置超時時間

**方法一**可以等待 goroutine 將任務完成再進行關閉，但這樣等待的時間並沒有限制

有可能造成等待的時間過長，一直無限的等待下去

為了預防這個問題，我們接著給`Showdown()`加上超時時間

```golang
func (t *Tracker) Showdown(ctx context.Context) error {
  ch := make(chan struct{})

  go func() {
    t.wg.Wait()
    close(ch)
  }()

  select {
  case <-ch:
    return nil
  case <-ctx.Done():
    return errors.New("timeout")
  }
}
```

我們接著改寫`main()`，並將`Event()`延長停止時間，故意讓它發生超時

```golang
func (t *Tracker) Event(data string) {
  t.wg.Add(1)

  go func() {
    defer t.wg.Done()
    // 延長至6秒
    time.Sleep(6 * time.Second)
    fmt.Println(data)
  }()
}

func main() {
  var a App
  a.Handle("1")
  a.Handle("2")
  // 設置超時時間5秒
  const timeout = 5 * time.Second
  ctx, cancel := context.WithTimeout(context.Background(), timeout)
  defer cancel()

  err := a.tracker.Showdown(ctx)
  if err != nil {
    log.Println(err)
  }
}
```

執行結果

```bash
1 App.Handle()
2 App.Handle()
xxxx/xx/xx xx:xx:xx timeout
```

#### 補充

## 總結

1. 將使用 goroutine 的選擇權交給調用者
2. 知道所使用的 goroutine 的生命週期(何時退出、如何退出)，避免 goroutine leak
3. 調用 goroutine 請加上 `panic` `recovery`機制，避免整個服務直接退出
4. **如果有大量請求，避免直接創建 goroutine處理**，應該使用`worker`模式來處理，可以避免調oom問題。若請求量很小的話，可以不用理會這個問題

## 參考資料

<https://lailin.xyz/post/go-training-week3-goroutine.html>
<https://dave.cheney.net/practical-go/presentations/qcon-china.html>
<https://www.ardanlabs.com/blog/2018/11/goroutine-leaks-the-forgotten-sender.html>
<https://www.ardanlabs.com/blog/2019/04/concurrency-trap-2-incomplete-work.html>
