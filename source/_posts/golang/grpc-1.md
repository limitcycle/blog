---
title: '[Middleware] 初探gRPC'
date: 2022-01-11 13:47:01
tags: middleware
categories: 學習
toc: true
cover: /images/golang/grpc-icon-color.png
---

gRPC是Google基於`Protobuf`開發的跨語言開源RPC框架。使用HTTP/2通訊協定，可以基於一個HTTP/2連線提供多個服務，對於移動設備更加友好。以下將使用Golang來說明實做

<!-- more -->

## grpc與REST

gRPC很容易拿來與REST做比較，以下先列舉gRPC與REST的對應表，來幫助我們更快的學習

| Feature  | gRPC  | REST  |
|-|-|-|
| Protocol  | HTTP/2  | HTTP/1.1  |
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

### 安裝相關插件

相關安裝內容可參考[gRPC官網教學](https://grpc.io/docs/languages/go/quickstart/)

#### Protocol Buffer Compiler

- Linux

``` bash
apt install -y protobuf-compiler
protoc --version  # Ensure compiler version is 3+
```

- MacOS

```bash
brew install protobuf
protoc --version  # Ensure compiler version is 3+
```

#### Go Plugins

1. protoc檔產生成Go語言的插件

   ``` bash
   go install google.golang.org/protobuf/cmd/protoc-gen-go
   go install google.golang.org/grpc/cmd/protoc-gen-go-grpc
   ```

2. 設置`PATH`讓`protoc`指令能找到剛剛安裝的插件

   ```bash
   export PATH="$PATH:$(go env GOPATH)/bin"
   ```

### 定義.proto檔案

建立專案資料夾

```bash
mkdir grpc-sample && cd grpc-sample 
```

初始化go mod

```bash
go mod init grpc-sample 
```

抓取grpc套件，供程式使用

```bash
go get google.golang.org/grpc
```

以下我們透過一個基本的`hello.proto`檔案，來講解撰寫`.proto`所需要的內容格式

```bash
mkdir proto && cd proto
touch hello.proto
```

hello.proto

```protobuf
syntax = "proto3";

package proto;

option go_package = "grpc-sample/proto";

service HelloService {
  rpc Hello (HelloRequest) returns (HelloReply);
}

message HelloRequest {
  string name = 1;
}

message HelloReply {
  string message = 1;
}
```

- **syntax**: 表示採用proto3的語法。

> proto3對語言進行了簡化，所有message裡的成員，均採用類似Go語言的型態初始值(不再支援自定義默認值)，也不再支援required特性

- **package**: 此.proto檔所在的目錄。
- **go_package**: 定義生成的Go程式所屬於的package
- **message**: protobuf中最基本的數據單位，對應Go語言中的struct。
- **service**: 定義RPC介面方法。

### 生成Go語言

進到有`.proto`檔案的資料夾，輸入以下指令

```bash
protoc --go_out=. --go_opt=paths=source_relative \
    --go-grpc_out=. --go-grpc_opt=paths=source_relative \
    *.proto
```

指令輸入完之後，會產生`*.pb.go`檔案，這是可以讓Go語言使用Protobuf和gRPC的檔案

> 關於protoc工具的使用，之後會有另一篇文章說明。現在先讓我們專注在如何撰寫gRPC

### 實作 gRPC Server

#### 實作 hello.proto 中的 HelloService

```golang
type server struct {
  pb.UnimplementedHelloServiceServer
}

func (s *server) Hello(ctx context.Context, req *pb.HelloReq) (*pb.HelloResp, error) {
  return &pb.HelloResp{Message: "Hello " + req.GetName()}, nil
}
```

#### 建立gRPC Server

```golang
const port = ":50051"

func main() {
  lis, err := net.Listen("tcp", port)
  if err != nil {
    log.Fatalf("failed to listen: %v", err)
  }

  grpcServer := grpc.NewServer()
  pb.RegisterHelloServiceServer(grpcServer, &server{})
  log.Printf("server listening at %v", lis.Addr())

  if err := grpcServer.Serve(lis); err != nil {
    log.Fatalf("failed to serve: %v", err)
  }
}
```

#### 啟動gRPC Server

```bash
go run server/server.go
```

### 建立gRPC Client

#### 建立與gRPC Server的連線

```golang
const (
  address     = "localhost:50051"
  defaultName = "world"
)

func main() {
  // 建立gRPC連線
  conn, err := grpc.Dial(address, grpc.WithInsecure(), grpc.WithBlock())
  if err != nil {
    log.Fatalf("did not connect: %v", err)
  }
  defer conn.Close()

  grpcClient := pb.NewHelloServiceClient(conn)

  name := defaultName
  if len(os.Args) > 1 {
    name = os.Args[1]
  }

  ctx, cancel := context.WithTimeout(context.Background(), time.Second)
  defer cancel()
  // 向gRPRC server發送請求
  resp, err := grpcClient.Hello(ctx, &pb.HelloReq{Name: name})
  if err != nil {
    log.Fatalf("could not get response: %v", err)
  }
  log.Printf("Message: %s", resp.GetMessage())
}
```

#### 啟動gRPC Client

```bash
go run client/client.go
```

啟動之後就會看到console上印出`Message: Hello world`

## gRPC的優缺點

總結來說，gRPC在效能上比REST快非常多(基於`HTTP/2`與`probuf`)，預設為`非同步`可以平行處理多個請求

> HTTP/1.1: 一個tcp連線，client發送一個請求，server回一個相對應的請求
> HTTP/2: 一個tcp連線，client可以發送多個請求，server可以回不只多個回應

### gRPC的優點

- 程式碼產生: `.proto`檔即是程式結構，並可產生多種語言相對應的程式
- 節省網路傳輸量：速度更快、檔案更小
- 節省 CPU 消耗：序列化以及反序列化`probuf(binary format)`，所消耗的CPU資源較JSON少
- 嚴格規格: 定義好`.proto`的schema，只要實作就可以了。不須爭論是何種HTTP Method

### gRPC的缺點

- 有限的瀏覽器支援: 無法直接從瀏覽器呼叫 gRPC 服務，只能透過[gRPC-Web](https://github.com/grpc/grpc-web)處理
- 不是人類看得懂的: prtobuf的二進位格式不是人類看得懂的
- 需要額外的學習時間和導入成本

## 總結

上面解講如何撰寫.proto檔，以及如何實作gRPC server跟client
大致上分成以下步驟:

1. 下載相關插件
2. 撰寫`.proto`檔案
3. 將`.protoc`檔產生成相對應的語言程式檔
4. 實作gRPC Server、gRPC client

以及分析gRPC的優缺點與REST的比較

完整程式碼可參閱[github](https://github.com/limitcycle/grpc-sample)

## 參考資料

- <https://grpc.io/docs/languages/go/quickstart/>
- <https://pjchender.dev/golang/grpc-getting-started/>
- <https://docs.microsoft.com/zh-tw/aspnet/core/grpc/comparison?view=aspnetcore-5.0>
