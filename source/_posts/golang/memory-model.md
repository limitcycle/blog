---
title: '[golang] Memory Model'
date: 2022-01-21 14:36:01
tags: golang
categories: 學習
toc: true
# cover: /images/golang/grpc-icon-color.png
---

Memory Modle在goroutine裡是非常重要的一環，理解它才能明白許多競爭問題。Go官方文章：["The Go Memory Model"](https://go.dev/ref/mem)裡有精確的解說。建議多看幾遍官方文章，會有更多的收穫

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

我們現在有一個變數`v`，如果以下兩個條件都成立，，則允許對變量 `v` 的讀取 `r` 觀察到對 `v` 的寫入：

1. 讀操作`r`發生在寫操作`w`之後
2. 且在寫操作`w`之後讀操作`r`之前，沒有其他寫操作
