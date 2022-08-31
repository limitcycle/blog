---
title: '[Java] 併發程式核心內容'
date: 2022-08-30 13:27:01
tags: 
  - java 
  - Thread
categories: 學習
toc: true
---

併發程式的三個核心內容: 分工、同步和互斥
此章節簡單介紹這三個核心內容與Java相對應的處理方式

<!-- more -->

## 分工

> 所謂的分工，類似於現實生活中一個組織完成一個項目，項目經理要拆分任務，安排合適的成員去完成。

在併發程式的領域，你就是項目經理，Thread就是項目成員。任務的分解和分工對於項目成敗非常關鍵，不過在併發領域裡，分工更為重要，他直接決定了併發程式的性能。

`java.util.concurrent` package裡的**Exuecutor、Fork/Join、Future**本質上是一種分工方法。

併發程式領域還總結一些設計模式，基本上都是和分工方法相關的，例如**生產者-消費者、Thread Pre-Message、Worker Thread**等模型都是用來指導如何分工。

## 同步

> 在併發程式領域中的同步，主要指的就Thread之間的協作。本質上和現實生活中的協作相同，就是**一個Thread執行完了一個任務，如何通知執行後續任務的Thread開工而已**。

分工好之後，就是具體執行了。在項目的執行中，任務之間會有依賴，一個任務結束後，依賴它的後續任務就可以開工，後續任務怎麼知道可以開工了？這個就是靠溝通協作了。

協作一般與分工相關。`java.util.concurrent` package裡的**Exuecutor、Fork/Join、Future**本質上都是分工方法，但同時也能解決Thread協作的問題。

> 例如，用Future可以發起一個異步調用，當Main Thread通過get()方法取結果時，Main Thread就會進行等待，等到異步執行的結果返回時，get()方法就會自動返回了。

Main Thread與異步Thread之間的協作，Future Class已經幫我們解決了。如此之外，`java.util.concurrent` package裡提供的**CountDownLatch、CyclicBarrier、Phaser、Exchanger**也都是用來解決Thread協作的問題。

工作中遇到的Thread協作問題，很多時候都是需要程式員自己來處理Thread之間的協作。基本上都可以簡單敘述成這樣的問題: **當某個條件不滿足時，Thread需要等待。當某個條件滿足時，Thread需要被喚醒執行**。

> 例如，在生產者-消費者模型(Producer-Consumers pattern)裡。
> 當queue滿時，Producer Thread等待，當queue不滿時，Producer Thread需要被喚醒執行。
> 當queue為空時，Consumer Thread等待，當queue不為空時，Consumer Thread需要被喚醒執行。

### Monitor

在Java併發領域中，解決協作問題的核心技術是[Monitor](https://zh.wikipedia.org/zh-tw/%E7%9B%A3%E8%A6%96%E5%99%A8_(%E7%A8%8B%E5%BA%8F%E5%90%8C%E6%AD%A5%E5%8C%96))，上面提到的所有Thread協作技術底層都是利用Monitor解決的。

Monitor是一種解決併發問題的通用模型，除了能解決Thread協作問題，還能解決下面要介紹的`互斥`問題。可以這麼說，**Monitor是解決併發問題的萬能鑰匙**。

這部份的關鍵是理解Monitor模型，學好它就可以解決所有問題。其次是了解`java.util.concurrent` package裡提供的Thread協作的class應用場景。

## 互斥

> 所謂互斥，指的是同一時間，只允許一個Thread訪問共享變量。

分工、同步主要強調的是性能，但在併發程式中還有一部份是關於正確性，用專業術語叫**Thread safe**。當併發程式裡，多個Thread同時訪問同一個共享變數時，結果是不一定的：意味著可能正確，也可能錯誤。

導致這種不確定的主要源頭是**可見性、有序性和原子性問題**。為了解決這些問題，Java引入了`Memory Model`。Java Memory Model提供了一系列的規則。利用這些規則可以避免可見性、有序性問題，但是還是不能完全解決Thread safe問題。確保Thread safe的最佳方案還是**互斥**。

實現互斥的核心技術就是`lock`，Java提供的synchronized以及SDK提供的各種Lock都能解決互斥問題。lock解決了安全性問題，但也帶來了性能問題，那如何保證安全性的同時又盡量提高性能呢？

可以依照使用場景優化，Java SDK裡提供的ReadWriteLock、StampedLockdk可以優化`讀多寫少`場景下的lock的性能。還可以使用無鎖的數據結構，例如Java SDK提供的`Atomic class`都是基於無鎖技術實現的。

除此之外，還有一些其他的方案，原理是`不共享变量`或者`變數只允許讀`。這方面，Java提供了Thread Local和final關鍵字，還有一種Copy-on-write的模式。

> 使用lock除了要注意性能問題之外，還需要注意`dead lock`問題。

## 結語

以上簡單的介紹併發程式中會遇到的問題，以及稍微提到Java SDK裡提供的工具能解決什麼樣的問題與何種應用場景方便使用。

之後會有更加詳細的介紹各項工具與併發問題。

## 參考資料

- <https://time.geekbang.org/column/159>
- <https://zh.wikipedia.org/zh-tw/%E7%9B%A3%E8%A6%96%E5%99%A8_(%E7%A8%8B%E5%BA%8F%E5%90%8C%E6%AD%A5%E5%8C%96)>
