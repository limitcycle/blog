---
title: '[Java] Java Memory Model'
date: 2022-09-17 15:04:01
tags: 
  - java 
  - Thread
categories: 學習
toc: true
---

上一章我們提到在併發的場景中，因為`可見性、原子性、有序性`問題導致我們併發程式的bug，Java也有針對這些問題提出解法。這章節就來介紹Java如何來解決其中的*可見性、有序性*問題: **Java Memory Model**

<!-- more -->

## 什麼是Java Memory Model

我們已經知道造成可見性問題是CPU快取，導致有序性問題是編譯優化，那解決可見性、有序性問題最直接的方法就是**禁用快取以及編譯優化**，雖然這樣我們的問題解決了，但是程式的效能就有憂慮了。

所以合理的方式是**按需**禁用快取及編譯優化。那麼如何做到*按需禁用*呢？對於併發程式，何時禁用快取以及編譯優化只有開發人員知道，那所謂的*按需禁用*其實就是按照開發人員的要求來禁用。

Java Memory Model是個很複雜的規範，站在開發人員的角度可以理解為: Java Memory Model規範了按需禁用快取及編譯優化的方法。具體來說，這些方法包括**Volatile、synchronized**和**final**三個關鍵字，以及六項**Happend-Before**的規則。

## Violatile

一個共享變數(class的成員變量、class的靜態)被`violatile`修飾之後，就具備兩個語意:

1. 這個變數的讀寫，不能使用CPU快取，必須從Memory讀取或寫入。
2. 禁止編譯重排序。

## Happens-Before規則

> 前一個的操作結果對後續的操作時是可見的

1. 程式的順序性規則

    這條規則是指**在一個thread中，按照程式順序，前面的操作Happends-Before於後續的任何操作**。

    例如下面的三行程式碼，第一行的"double pi = 3.14" `happends-before` "double r = 1.0"。這就是規則1的內容，比較符合single thread的思維: 程式前面對某個變數的修改一定對後續操作可見的。

    ```java
    double pi = 3.14;
    double r = 1.0;
    double area = pi * r * r;
    ```

2. Monitor中的鎖規則

    這條規則是指對**一個鎖的解鎖 Happends-Before 於隨後對這個鎖的加鎖**。

    這個規則的鎖其實就是Java中的`synchronized`。例如下面的程式碼，在進入synchronized區塊之前，會自動加鎖，而在這區塊執行完會自動釋放鎖，加鎖以及解鎖都是編譯器幫我們實現的。

    ```java
    synchronized (this) { // 此處自動加鎖
    // x是共享變數，初始值是10
    if (this.x < 12) {
      this.x = 12; 
     }  
    } // 此處自動解鎖
   ```

    結合鎖的規則: 假設x的初始值是10，Thread A執行完之後x變成12(執行完自動釋放鎖)，Thread b進入程式時，會看到thread a的寫操作，也就是Thread b能看到x=12。

3. violatile變數規則

    **對一個violatile的變數寫操作 Happends-Before 於後續對這個violate變數的讀操作。**

    這就有點難理解了，這怎麼看就是禁用快取阿。讓我們搭配下面的規則4，感受一下。

4. 傳遞性

   **如果A Happends-Before B，且B Happends-Before C，那麼A Happends-Before C。**

   我們把規則4的傳遞性應用到下面的例子，會發生什麼事？

   ```java
   class VolatileExample {
     int x = 0;
     volatile boolean v = false;
     public void writer() {
       x = 42;
       v = true;
     }
     public void reader() {
       if (v == true) {
         // 這裡x會是多少？
       }
     }
   }
   ```

   可以看下面的圖:
   ![規則4程式執行示意圖](/images/java/concurrentcy/happend-before-rule4.jpg)

   從圖中，我們可以看到:

   1. "x=42" Happends-Before 寫變數"v=true"。這是`規則1`的內容
   2. 寫變數"v=true" Happends-Before 讀變數"v=true"。這是`規則3`的內容

   再根據現在這個`規則4(傳遞性)`，我們得到這個結果: "x=42" Happends Before 讀變數 "v=true"。這代表什麼？

   如果Thread B讀到"v=true"，那麼Thread A設置的"x=42"對Thread B是可見的，也就是說Thread B能看到"x=42"。

5. start()規則

    > 這條是關於Thread啟動的。

    **它是指Main-Thread A啟動Sub-Thread B後，Sub-Thread B能夠看到Main-Thread在啟動Sub-Thread B之前的操作**。

    也就是說Thead A調用Thread B的start()方法(在Thread A中啟動Thread B)，那麼start() Happends-Before於Thread B的任何操作。可以參考下面程式:

    ```java
    Thread B = new Thread(() -> {
      /** 
          Main-Thread調用B.start()之前
          所有對共享變數的修改皆可見
          此例中，x=77
      **/
    });
    // 此處對共享變數x進行修改
    x = 77;
    // Main-Thread啟動Sub-Thread
    B.start();
    ```

6. join規則

   > 這條是關於Thread等待。

   是指Main-Thread A等待Sub-Thread B完成(Main-Thread A通過調用Sub-Thread B的join()方法實現)，當Sub-Thread完成之後(Main-Thread A join()方法返回)，Main-Thread能看到Sub-Thread的操作。這邊能看到的是指**共享變數**的操作。

   換句話說，就是在Thread A中調用Thread B的join()方法並返回，那麼Thread B中的任意操作Happends-Before於Thread A從ThreadB.join()的成功操作並返回。

   ```java
   Thread B = new Thread(()->{
   // 此處對共享變數var修改
   var = 66;
   });
   /**
   * 例如此處對共相變數修改，
   * 則這個修改結果對Thread B可見 
   **/
   B.start();
   B.join();
   /**
   * Sub-Thread B所有對共享變數的修改
   * 在Main-Thread A調用B.join()之後皆可見
   **/
   ```

## final

前面所講violate為的是禁用快取以及編譯優化，再從另一個方面來看，有沒有辦法告訴編譯器優化的好一點?方法是有的，就是**final**關鍵字。

final修飾變數時，初衷就是告訴編譯器:**這個變數生而不變，可以用力的優化**

## 參考資料

- <https://zhuanlan.zhihu.com/p/126275344>
- <https://www.twblogs.net/a/5b8672242b71775d1cd543a8>