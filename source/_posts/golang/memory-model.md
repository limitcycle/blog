---
title: '[golang] Memory Model'
date: 2022-02-21 14:36:01
tags: golan
categories: 學習
toc: true
# cover: /images/golang/grpc-icon-color.png
---

Memory Modle在goroutine裡是非常重要的一環，理解它才能明白許多競爭問題。Go官方文章：["The Go Memory Model"](https://go.dev/ref/mem)裡有精確的解說。建議多看幾遍官方文章，再看這篇文章，會有更多的收穫

<!-- more -->

## Happens Before

### 定義

在文章中`Happens Before`的定義如下:

> To specify the requirements of reads and writes, we define happens before, a partial order on the execution of memory operations in a Go program. If event `e1` happens before event `e2`, then we say that `e2` happens after `e1`. Also, if `e1` does not happen before `e2` and does not happen after `e2`, then we say that `e1` and `e2` happen concurrently.

意思就是說，如果`e1`發生在`e2`之前，我們也可以說`e2`發生在`e1`之後，如果`e1`既不在`e2`前，也不在`e2`後，我們就說我們就說`e1`與`e2`是併發狀態

> Within a single goroutine, the happens-before order is the order expressed by the program.

在單個goroutine中，事件發生的順序，就是程式執行的順序

> A read r of a variable `v` is allowed to observe a write `w` to `v` if both of the following hold:
>
> 1. r does not happen before `w`.
> 2. There is no other write `w'` to v that happens after w but before `r`.

我們現在有一個變量`v`，如果以下兩個條件都成立，則**允許**對變量 `v` 的讀操作`r` 觀察到對 `v` 的寫操作`w`：

1. 讀操作`r`發生在寫操作`w`之後
2. 在寫操作`w`之後讀操作`r`之前，沒有其他對`v`的寫操作

> To guarantee that a read `r` of a variable `v` observes a particular write `w` to `v`, ensure that `w` is the only write `r` is allowed to observe. That is, `r` is guaranteed to observe `w` if both of the following hold:
>
> 1. `w` happens before `r`.
> 2. Any other write to the shared variable `v` either happens before `w` or after `r`.

為了保證對變量`v`的讀操作`r`看到對`v`的寫操作`w`，要確保`w`是`r`允許看到的唯一寫操作。即當下面條件滿足時，`r`**保證**看到`w`:

1. `w`發生在`r`之前
2. 其他對共享變量`v`的寫操前只能發生在`w`之前`r`之後

這一個條件比前面的條件更嚴格，需要確保沒有其他的寫操作與`w`或`r`併發

+ 在單個goroutine中，這兩個條件式相等的，因為單個goroutine中不存在併發
+ 在多個goroutine中就必須使用同步來確保順序，這樣才能保證能夠監測到預期的寫入

### 圖示

#### 單個goroutine

我們可以發現在單個goroutine中，讀操作`r`總是可以讀取到上一次`w`寫入的值
![單個goroutine](/images/golang/memory-model/single-goroutine.png)

#### 多個goroutine

但在多個goroutine的狀況下舊部一定了，`r0`讀到的會是哪一個寫入的值？如果單純看圖像是`w4`，但其實不一定，因為每條goroutine執行的時間都不一定，因此這兩條goroutine在邏輯上並無先後順序

所以`r0`可能讀到的是`w0 w3 w4`甚至`w5`的結果，若是按照我們前面說的理論，讀到的不可能是`w1`的結果

![多個goroutine](/images/golang/memory-model/multi-goroutine.png)

#### 增加同步點

在下圖中為兩個goroutine增加3個同步點。這樣的話，對於`r1`來說晚於`w4`且早於`w1`和`w5`執行，所以`r1`讀取到的值確定是`w4`

`r2`之前的寫操作為`w4`，與其併發的有`w1`，所以`r2`的值是不確定。有可能是`w1`也可能是`w4`

![增加同步點](/images/golang/memory-model/sync.png)

### 建議

> Programs that modify data being simultaneously accessed by multiple goroutines must serialize such access.
To serialize access, protect the data with `channel` operations or other synchronization primitives such as those in the `sync` and `sync/atomic` packages.

如果程式中存在多個goroutine去訪問數據時，必須**序列化訪問**，如何保證序列化呢？ 我們可以使用`channel`或者`sync`以及`sync/auomic`所提供的同步語法來保證

## Memory Reordering

我們所寫下的程式都會經過編譯才能運行到CPU上，而為了有效利用CPU最高的性能，通常使用流水線(Pipeline)、分支預測(Branch predictor)等等。為了提高讀寫memory的效率，會對讀寫指令進行重新排列，這就是所謂的`Memory Reordering`

### 編輯器重排(Compiler Reordering)

我們來看一個例子：

```bash
X = 0
for i in range(100):
  X = 1
  print X
```

在這段程式碼中，X在for循環中重複被賦值了100次1，這簡直沒有必要。於是編譯器就會幫我們優化成下面的程式碼

```bash
X = 1
for i in range(100):
  print X
```

這樣的優化，減少了100次的賦值，同樣也輸出100個1。

在單個goroutin中這樣並不會改變執行的順序。

但在多個goroutine中，如果有一個goroutine做了 X = 0，這個輸出就有可能變成111100110111101111100000111...這樣的結果。

所以在多個goroutine裡為了訪問數據的正確性，需要前面所說的**序列化訪問**

> 在多核心場景下，沒有辦法輕易判斷兩段程式是否`等價`

### CPU reordering

CPU為了弭平Kernel、memory、disk之間的速度差異，使用了各種方式，三級緩存就是其中一種。這種為了加速所設計的緩存系統，有可能會帶來數據不一致的問題

![CPU store buffer](/images/golang/memory-model/cpu-store-buffer.png)

1. 先執行①跟③，Core1將A=1寫入Core1的store buffer，Core2將B=1寫入Core2的store buffer
2. 接著執行②、④
3. ②看了store buffer沒有發現B的值，於是從Memory讀出了0
4. ④同樣從Memory讀出了0
5. 最後輸出了00

因此對多執行緒的程式，所有CPU都會提供"鎖"的支持，稱為`barrier`或`fence`。
更多內容可參考: <https://cch123.github.io/ooo/>

## 總結

此篇文章稍微解釋了一下，在程式運行中變量是如何會有競爭關係。以及再稍為提一下程式在編譯與運行在機器上會幫我們進行優化動作所產生的問題。所以當我們在寫goroutine邏輯時需要特別小心，有使用到共用變量的話，可以使用Go官方所提供的同步方法

## 參考資料

+ <https://lailin.xyz/post/go-training-week3-go-memory-model.html>
+ <https://go.dev/ref/mem>
+ <https://go-zh.org/ref/mem>
+ <https://cch123.github.io/ooo/>
