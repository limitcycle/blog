---
title: '[Middleware] 初探gRPC'
date: 2022-01-11 13:47:01
tags: middleware
toc: true
# cover: 
---

gRPC是Google基於`Protobuf`開發的跨語言開源RPC框架。使用HTTP/2通訊協定，可以基於一個HTTP/2連線提供多個服務，對於移動設備更加友好。以下將使用Golang來說明實做

<!-- more -->

## grpc與REST

gRPC很容易拿來與REST做比較，以下先列舉gRPC與REST的對應表，來幫助我們更快的學習

| Feature  | gRPC  | REST  |
|---|---|---|---|---|
| Protocol  | HTTP/2  | HTTP/1  |
| Payload  | Protobuf(binary, small)  | JSON(text, large) |
| API contract | .proto | OpenAPI |
| Code generation | protoc | Swagger |
| Security | TLS/SSL | TLS/SSL |
| Streaming | Bidirectional streaming | client &rarr; server |
| Browser support | require gRPC-web | Yes |

資料來源: <https://dev.to/techschoolguru/is-grpc-better-than-rest-where-to-use-it-3blg>

## Protobuf

Protobuf是Protocol Buffers的簡稱，是由Google公司開發的一種數據描述語言(類似XML或是JSON)。

在學習gRPC之前，需要先了解Protobuf。Protobuf是gRPC裡的傳輸格式，類似Restful的JSON格式

### 安裝protobuf與GRPC

``` bash
go get google.golang.org/grpc
go get github.com/golang/protobuf/protoc-gen-go
```

### 定義.proto檔案

以下我們透過一個基本的hello.proto檔案，來講解撰寫*.proto所需要的內容格式

```protobuf
syntax = "proto3";

package main;

service HelloService {
  rpc Hello (String) return (String);
}

message String {
  string value = 1;
}
```

- syntax: 表示採用proto3的語法。

> proto3對語言進行了簡化，所有message裡的成員，均採用類似Go語言的型態初始值(不再支援自定義默認值)，也不再支援required特性

- package: 表示當前是main package。
- message: protobuf中最基本的數據單位，類似Go語言中struct的存在。
- service: 類似Go語言中func的存在。

### 生成Go語言
