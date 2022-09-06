---
title: '[Java] 可見性、原子性和有序性'
date: 2022-09-03 13:18:01
tags: 
  - java 
  - Thread
categories: 學習
toc: true
---

在撰寫併發程式時，Bug往往會詭異的出現，然後又詭異的消失，很難重現，也很難追蹤。但想要快速且精準的解決併發出現的問題，就要理解出現這些事件的本質，追本朔源，深入分析這些問題的源頭在哪裡。

那為什麼併發程式會很容易出問題？它又是怎麼出現問題的？今天就讓我們聊聊這些問題吧!

<!-- more -->

## 併發程式背後的故事

CPU、Memory、IO設備在這些年內不斷的迭代更新。但是在這快速發展的過程中，有一個**核心矛盾一直存在，就是這三者的速度差異**。

> 速度差異(快&rarr;慢)： CPU > Memory > IO

為了合理利用CPU的高性能，平衡這三者的速度差異，電腦體系結構、OS、程式編譯器都做出了貢獻，主要體現為：

1. CPU增加了`快取(cache)`，來均衡與Memory的速度差異。
2. OS增加了Process、Thread，以[分時系統](https://zh.wikipedia.org/zh-tw/%E5%88%86%E6%99%82%E7%B3%BB%E7%B5%B1)來復用CPU，進而均衡CPU與IO的速度差異。
3. 程式編譯器優化程式執行順序，使得快取能夠得到更加合理的利用。

現在我們所有程式都默默享受著這些成果，但是天下沒有免費的午餐，併發的許多詭異問題的根源也在這裡。

## 源頭一： CPU快取導致的可見性問題

> 一個Thread對共享變量的修改，另外一個Thread能夠立刻看到，我們成為**可見性**。

多核時期，每個CPU都有自己的快取，這時CPU快取與Memory的數據一致性就沒那麼容易解決了，當多個Thread在不同的CPU執行時，這些Thread操作的是不同的CPU快取。

比如下圖中，Thread A操作的是CPU-1上的快取，而Thread B操作的是CPU-2上的快取，這時候Thread A對變數V的操作對於Thread B而言就不具備可見性了。

![多core CPU的快取與Memory關係圖](/images/java/concurrentcy/visibility-atomic-ordering/cpu-cache.png)

下面我們再用一段程式驗證一下多核場景下的可見性問題。

下面代碼，每執行一次add10K()方法，都會循環10000次count+=1操作。在calc()方法中我們建立的兩個Thread，每個Thread調用一次add10K()方法。

```java
public class Test {

  private long count = 0;

  private void add10K() {
    int idx = 0;
    while (idx++ < 10000) {
      count += 1;
    }
  }

  public long calc() throws InterruptedException {
    // 創建兩個Thread，執行add操作
    Thread thA = new Thread(this::add10K);
    Thread thB = new Thread(this::add10K);
    // 啟動兩個Thread
    thA.start();
    thB.start();
    // 等待兩個Thread執行結束
    thA.join();
    thB.join();
    return count;
  }
}
```

我們設想的執行結果20000，因為在單一Thread裡調用兩次add10K()方法，count的值就是20000，但是實際上calc()的執行結果是介於10000到20000之間的隨機數，為什麼會這樣呢？

我們假設Thread A和Thread B同時開始執行，在一開始時都會將*count=0讀到各自的CPU快取中*，執行完count+=1之後，各自的CPU快取中的值都是1，同時寫入Memory後，我們會發現Memory中的值會是1，而不是我們預期的2。之後由於各自的CPU快取裡都有count的值，兩個Thread都是基於CPU快取裡的count值來計算，所以導致最後count的值都會是小於20000。

這就是CPU快取的可見性問題。

## 源頭二: Thread切換帶來的原子性問題

由於IO太慢，早期的OS就發明了Multi-Processing，即便在單核CPU上我們也可以一邊聽著歌，一邊寫程式，這個就是Multi-Processing的功勞。

OS允許某一個某個Process執行一小段時間，例如50毫秒，過了50毫秒OS就會重新選擇一個Process來執行(俗稱:[任務切換Task Switching](https://en.wikipedia.org/wiki/Task_switching_(psychology))，這個50毫秒稱為[時間片](https://zh.wikipedia.org/zh-tw/%E6%97%B6%E9%97%B4%E7%89%87)。

Java的併發程式都是基於多執行緒的，自然也會涉及到任務切換，但這也是會產生bug的源頭之一。

任務切換的時機大多是在時間片結束的時候，我們現在基本都使用高級語言程式，高級語言裡一條執行語句往往需要多條CPU指令來完成，例如上方代碼中的count+=1，至少需要3條CPU指令。

- 指令1: 先把變數count從內存加載到CPU的[暫存器](https://zh.wikipedia.org/zh-tw/%E5%AF%84%E5%AD%98%E5%99%A8)。
- 指令2: 接著，在暫存器中執行+1操作。
- 指令3: 把結果寫入Memory(CPU快取機制有可能寫入的是CPU快取而不是Memory)

OS做任務切換，可以發生在任何一條**CPU指令**執行完。沒錯，是CPU指令，而不是高級語言裡的一條語句。對於上面的三條指令來說，對於上面的三條指令來說，我們假設count=0，如果Thread A在指令1執行完做任務切換，Thread A和Thread B按照下圖的順序執行，那麼我們會發現兩個Thread都執行了count+=1的操作，但是得到的結果不是我們所預期的2，而是1。

![非原子操作的執行路徑示意圖](/images/java/concurrentcy/visibility-atomic-ordering/cpu-cache.png)

我們的直覺會覺得count+=1這個操作是一個不可分割的整體，就像一個原子一樣，Thread的切換可以發生在count+=1之前，也可以發生在count+=1之後，但就是不會發生在中間。

> 我們把一個或多個操作**在CPU執行的過程中不被中斷**的特性稱為`原子性`

## 源頭三: 編譯優化帶來的有序性問題

編譯器為了優化效能，有時候會改變程式中的程式先後順序，讓我們看看下面例子:

```java
int x = 0;
for (i = 0; i < 100;i++) {
  x = 1;
  System.out.println(x);
}
```

在這段程式碼中，x在for循環裡重複被賦值了100次的1，但這簡直沒有必要。於是編譯器幫我們優化成下面的程式碼:

```java
int x = 1;
for (i = 0; i < 100;i++) {
  System.out.println(x);
}
```

我們接著來看在Java領域中一個經典的案例，來看如果編譯器幫我們優化程式會發生什麼問題。

單例模式的雙重檢查: 在getInstance()方法中，我們先判斷instance是否為null。如果是null，則鎖定Singleton.class並再次檢查instance是否為null，如果還是null則建立Singleton的一個實體。

```java
public class Singleton {
  static Singleton instance;

  static Singleton getInstance(){
  if (instance == null) {
    synchronized(Singleton.class) {
      if (instance == null)
        instance = new Singleton();
      }
    }
    return instance;
  }
}
```

假設有兩個Tread A、B同時調用getInstance()方法，會同時發現instance==null，於是同時對Singleton.class加鎖，此時JVM能保證只有一個Thread能加鎖成功(假設是Thread A)，另一條Thread就會處於等待狀態。接著Thread A會建立一個Singleton實體，之後釋放鎖。鎖釋放後，Thread B被喚醒，然後嘗試加鎖，此時可以加鎖成功，Thread B接著檢查instance == null會發現已經有Singleton實體了，所以Thread B就不會再建立一個Singleton實體了。

理論上這一切都很完美，但是實際上getInstance()方法卻有遐疵。
問題出在new操作上，我們以為的new操作是：

1. 分配一塊記憶體M
2. 在記憶體M上初始化Singleton物件
3. 然後將M的地址賦值給instance變數

然而實際優化過的執行路徑卻是如下：

1. 分配一塊記憶體M
2. 將M的地址賦值給instance變數
3. 最後在記憶體M上初始化Singleton物件

優化後會產生什麼問題？我們假設Thread A先執行getInstance()方法，當執行完指令2時，剛好發生Thread切換到Thread B，如果此時Thread B執行getInstance()方法時，Thread B會判斷到`instance != null`，所以直接返回instance，但是此時的instance是還沒有初始化過的。如果我們現在使用instance就發生NullPointerException。

![單例模式的雙重檢查異常執行路徑](/images/java/concurrentcy/visibility-atomic-ordering/order-problem.jpg)

## 結語

以上在介紹可見性、原子性、有序性時，特地介紹**CPU快取**帶來的可見性問題，**Thread切換**帶來的原子性問題，**編譯優化**帶來的有序性問題，其實CPU快取、Thread切換以及編譯優化的目的都是提高效能。技術解決一個問題，同時也帶來了一個新的問題，所以在**採用一項技術的同時，一定要清楚它帶來的問題是什麼，以及如何規避**。

## 參考資料

- <https://time.geekbang.org/column/159>(01)
- <https://www.jianshu.com/p/45885e50d1c4>
- <https://zh.wikipedia.org/zh-tw/%E5%88%86%E6%99%82%E7%B3%BB%E7%B5%B1>
- <https://en.wikipedia.org/wiki/Task_switching_(psychology)>
- <https://zh.wikipedia.org/zh-tw/%E5%88%86%E6%99%82%E7%B3%BB%E7%B5%B1>
