---
title: '[架構] 深入淺出分布式事務 TCC 模式'
date: 2025-08-15 10:02:10
tags: [TCC, Distributed Transaction, Architecture]
categories: distributed-systems
toc: true
---

在微服務架構下，單體應用被拆分成多個獨立的服務，帶來了開發靈活、易於擴展等優點。但同時，也帶來了一個棘手的問題：**如何保證跨多個服務的數據一致性？**

傳統的本地事務 ACID 模型在分布式環境下不再適用。為了解決這個問題，業界提出了許多分布式事務的解決方案，例如 2PC、Saga，以及我們今天的主角：**TCC**。

那麼，到底什麼是 TCC 模式？它又是如何解決分布式事務難題的呢？

<!-- more -->

## 設計思維

### 補償型事務

TCC (Try-Confirm-Cancel) 的核心設計思維是 **補償**。與剛性事務不同，它並不追求強一致性，而是透過一系列的補償操作，來達到數據的 **最終一致性**。

> TCC 模式將一個完整的業務邏輯拆分成 `Try`、`Confirm`、`Cancel` 三個獨立的部分。由主業務服務（協調者）來調用所有從業務服務（參與者）的 `Try` 操作，如果全部成功，則調用 `Confirm`；若有任何一個失敗，則調用 `Cancel` 進行補償。

### 業務侵入

一個顯著的特點是，TCC 對業務的 **侵入性很強**。開發人員需要為每個服務手動編寫 `Try`, `Confirm`, `Cancel` 三個接口的邏輯，這對程式碼的設計和開發成本都提出了更高的要求。

## TCC 的三個階段詳解

讓我們以一個常見的「跨行轉帳」場景為例，這個操作涉及到用戶 A 的銀行（服務 A）和用戶 B 的銀行（服務 B）。

### 1. Try 階段

`Try` 階段的主要任務是 **檢查業務可行性並預留資源**。

*   **服務 A (轉出方)**: 檢查用戶 A 帳戶餘額，如果足夠，則 **凍結** 轉帳金額。
    *   **重點**: 這裡不是直接扣款，而是將資金狀態變為「凍結中」，確保這筆錢不會被其他事務使用。
*   **服務 B (轉入方)**: 檢查用戶 B 帳戶狀態是否正常，並 **預增加** 一筆待入帳記錄。

如果 `Try` 階段任一方失敗（例如餘額不足），主業務服務會立即觸發所有參與者的 `Cancel` 操作。

### 2. Confirm 階段

當所有參與者的 `Try` 操作都成功後，主業務服務會依序調用 `Confirm` 接口，**真正地執行業務**。

*   **服務 A (轉出方)**: 執行實際的扣款，將凍結的金額扣除。
*   **服務 B (轉入方)**: 將「待入帳」的記錄正式更新為用戶 B 的餘額。

> `Confirm` 操作必須是 **冪等** 的。因為網絡問題可能導致重試，需要確保重複調用不會導致用戶被多次扣款或入帳。

### 3. Cancel 階段

如果 `Try` 階段有任何失敗，主業務服務會調用 `Cancel` 接口，**取消所有已執行的操作，釋放預留資源**。

*   **服務 A (轉出方)**: **解凍** 之前凍結的金額，使其恢復可用。
*   **服務 B (轉入方)**: 刪除或標記「待入帳」記錄為無效。

> `Cancel` 操作也必須是 **冪等** 的，以應對可能的重試。

### 程式碼範例 (以 Java 為例)

為了更具體地展示 TCC 模式，以下是一個簡化的 Java 程式碼範例。我們假設有一個 `AccountService` 作為事務參與者。

#### 1. 定義 TCC 接口

首先，我們定義參與者需要實現的 TCC 接口。

```java
import java.math.BigDecimal;

// TCC 參與者接口
public interface TccAction {
    // Try 階段：預留資源
    boolean prepare(String transactionId, BigDecimal amount);

    // Confirm 階段：提交事務
    boolean commit(String transactionId);

    // Cancel 階段：回滾事務
    boolean rollback(String transactionId);
}
```

#### 2. 實現轉出帳戶服務

接著，我們來實現轉出方的 `AccountService`。為了簡化，我們使用 `ConcurrentHashMap` 來模擬資料庫中的帳戶和凍結資源。

```java
import java.math.BigDecimal;
import java.util.concurrent.ConcurrentHashMap;

public class AccountService implements TccAction {

    // 模擬用戶帳戶資料庫
    private static final ConcurrentHashMap<String, BigDecimal> accounts = new ConcurrentHashMap<>();
    // 模擬凍結資源的資料庫
    private static final ConcurrentHashMap<String, BigDecimal> frozenResources = new ConcurrentHashMap<>();

    private final String accountId;

    public AccountService(String accountId, BigDecimal initialBalance) {
        this.accountId = accountId;
        accounts.put(accountId, initialBalance);
    }

    @Override
    public boolean prepare(String transactionId, BigDecimal amount) {
        System.out.printf("Attempting to prepare transaction %s for account %s with amount %.2f%n", transactionId, accountId, amount);
        
        // 檢查餘額是否足夠
        BigDecimal currentBalance = accounts.get(accountId);
        if (currentBalance.compareTo(amount) < 0) {
            System.out.printf("Account %s has insufficient funds. Current: %.2f, Required: %.2f%n", accountId, currentBalance, amount);
            return false;
        }

        // 凍結資源：從可用餘額中扣除，但不實際轉出
        accounts.computeIfPresent(accountId, (k, v) -> v.subtract(amount));
        frozenResources.put(transactionId, amount);
        System.out.printf("Successfully prepared transaction %s. Frozen %.2f from account %s. Remaining balance: %.2f%n", 
                transactionId, amount, accountId, accounts.get(accountId));
        return true;
    }

    @Override
    public boolean commit(String transactionId) {
        System.out.printf("Attempting to commit transaction %s for account %s%n", transactionId, accountId);
        if (frozenResources.containsKey(transactionId)) {
            // 確認提交，將凍結資源移除
            BigDecimal amount = frozenResources.remove(transactionId);
            System.out.printf("Successfully committed transaction %s. Released %.2f from account %s.%n", transactionId, amount, accountId);
            return true;
        }
        // 冪等性處理：如果資源已經被移除，也視為成功
        System.out.printf("Transaction %s already committed or rolled back.%n", transactionId);
        return true;
    }

    @Override
    public boolean rollback(String transactionId) {
        System.out.printf("Attempting to roll back transaction %s for account %s%n", transactionId, accountId);
        if (frozenResources.containsKey(transactionId)) {
            // 取消事務，將凍結的資源歸還給帳戶
            BigDecimal amount = frozenResources.remove(transactionId);
            accounts.computeIfPresent(accountId, (k, v) -> v.add(amount));
            System.out.printf("Successfully rolled back transaction %s. Returned %.2f to account %s.%n", transactionId, amount, accountId);
            return true;
        }
        // 冪等性處理：如果資源已經被移除，也視為成功
        System.out.printf("Transaction %s already committed or rolled back.%n", transactionId);
        return true;
    }

    public BigDecimal getBalance() {
        return accounts.get(accountId);
    }
}
```

#### 3. 實現轉入帳戶服務

接著實現轉入方的帳戶服務：

```java
import java.math.BigDecimal;
import java.util.concurrent.ConcurrentHashMap;

public class ReceiveAccountService implements TccAction {
    
    // 模擬用戶帳戶資料庫
    private static final ConcurrentHashMap<String, BigDecimal> accounts = new ConcurrentHashMap<>();
    // 模擬待入帳記錄
    private static final ConcurrentHashMap<String, BigDecimal> pendingDeposits = new ConcurrentHashMap<>();
    
    private final String accountId;
    
    public ReceiveAccountService(String accountId, BigDecimal initialBalance) {
        this.accountId = accountId;
        accounts.put(accountId, initialBalance);
    }
    
    @Override
    public boolean prepare(String transactionId, BigDecimal amount) {
        System.out.printf("Attempting to prepare deposit for account %s with amount %.2f%n", accountId, amount);
        
        // 檢查帳戶狀態是否正常（簡化處理）
        if (!accounts.containsKey(accountId)) {
            System.out.printf("Account %s does not exist.%n", accountId);
            return false;
        }
        
        // 創建待入帳記錄
        pendingDeposits.put(transactionId, amount);
        System.out.printf("Successfully prepared deposit for transaction %s. Pending amount: %.2f for account %s%n", 
                transactionId, amount, accountId);
        return true;
    }
    
    @Override
    public boolean commit(String transactionId) {
        System.out.printf("Attempting to commit deposit for account %s%n", accountId);
        
        if (pendingDeposits.containsKey(transactionId)) {
            BigDecimal amount = pendingDeposits.remove(transactionId);
            // 正式入帳
            accounts.computeIfPresent(accountId, (k, v) -> v.add(amount));
            System.out.printf("Successfully committed deposit for transaction %s. Added %.2f to account %s. New balance: %.2f%n", 
                    transactionId, amount, accountId, accounts.get(accountId));
            return true;
        }
        
        // 冪等性處理
        System.out.printf("Transaction %s already committed or rolled back.%n", transactionId);
        return true;
    }
    
    @Override
    public boolean rollback(String transactionId) {
        System.out.printf("Attempting to roll back deposit for account %s%n", accountId);
        
        if (pendingDeposits.containsKey(transactionId)) {
            BigDecimal amount = pendingDeposits.remove(transactionId);
            System.out.printf("Successfully rolled back deposit for transaction %s. Cancelled %.2f for account %s%n", 
                    transactionId, amount, accountId);
            return true;
        }
        
        // 冪等性處理
        System.out.printf("Transaction %s already committed or rolled back.%n", transactionId);
        return true;
    }
    
    public BigDecimal getBalance() {
        return accounts.get(accountId);
    }
}
```

#### 4. 事務協調器

最後，我們需要一個事務協調器來模擬整個 TCC 流程。它將調用參與者的 `prepare` 方法，並根據結果決定是 `commit` 還是 `rollback`。

```java
import java.math.BigDecimal;
import java.util.UUID;

public class TccCoordinator {

    public static void main(String[] args) {
        // 初始化帳戶：A帳戶轉出，B帳戶轉入
        AccountService senderService = new AccountService("A", new BigDecimal("1000"));
        ReceiveAccountService receiverService = new ReceiveAccountService("B", new BigDecimal("500"));
        
        System.out.printf("Initial balances: Sender A=%.2f, Receiver B=%.2f%n%n", 
                senderService.getBalance(), receiverService.getBalance());

        // --- 模擬一次成功的轉帳 ---
        System.out.println("=== Starting Successful Transaction ===");
        String txIdSuccess = UUID.randomUUID().toString();
        BigDecimal transferAmount = new BigDecimal("200");

        // 1. Try 階段：所有參與者預留資源
        boolean senderPrepared = senderService.prepare(txIdSuccess, transferAmount);
        boolean receiverPrepared = receiverService.prepare(txIdSuccess, transferAmount);

        if (senderPrepared && receiverPrepared) {
            System.out.println("All participants prepared successfully. Proceeding to commit.");
            // 2. Confirm 階段：所有參與者確認執行
            senderService.commit(txIdSuccess);
            receiverService.commit(txIdSuccess);
            System.out.println("✓ Transaction committed successfully!");
        } else {
            System.out.println("Some participants failed to prepare. Rolling back.");
            // 3. Cancel 階段：回滾所有操作
            senderService.rollback(txIdSuccess);
            receiverService.rollback(txIdSuccess);
            System.out.println("✗ Transaction rolled back.");
        }
        
        System.out.printf("Balances after successful transaction: Sender A=%.2f, Receiver B=%.2f%n%n", 
                senderService.getBalance(), receiverService.getBalance());

        // --- 模擬一次失敗的轉帳 (餘額不足) ---
        System.out.println("=== Starting Failed Transaction (Insufficient Funds) ===");
        String txIdFail = UUID.randomUUID().toString();
        BigDecimal largeAmount = new BigDecimal("1500"); // 超過餘額

        // 1. Try 階段
        boolean senderFailPrepared = senderService.prepare(txIdFail, largeAmount);
        boolean receiverFailPrepared = false;
        
        // 如果發送方準備失敗，協調器通常會立即決定回滾，不再調用其他參與者
        if (!senderFailPrepared) {
            System.out.println("Sender preparation failed. Skipping receiver preparation.");
        } else {
            receiverFailPrepared = receiverService.prepare(txIdFail, largeAmount);
        }

        if (senderFailPrepared && receiverFailPrepared) {
            // 2. Confirm 階段
            senderService.commit(txIdFail);
            receiverService.commit(txIdFail);
            System.out.println("✓ Transaction committed successfully!");
        } else {
            // 3. Cancel 階段
            System.out.println("Transaction failed. Rolling back all participants.");
            senderService.rollback(txIdFail);
            receiverService.rollback(txIdFail);
            System.out.println("✗ Transaction rolled back as expected.");
        }
        
        System.out.printf("Final balances: Sender A=%.2f, Receiver B=%.2f%n", 
                senderService.getBalance(), receiverService.getBalance());
    }
}
```

## TCC 的挑戰與應對

TCC 雖然解決了分布式事務的問題，但也引入了新的複雜性。

### 1. 業務侵入性高

**挑戰**: 如前所述，開發成本高，需要為每個事務參與者實現 TCC 的三個接口。
**應對**: 可以考慮將 TCC 的邏輯封裝成框架或服務，減少重複開發。

### 2. 冪等性問題

**挑戰**: `Confirm` 和 `Cancel` 可能被重複調用。
**應對**: 必須在業務邏輯中保證操作的冪等性。例如，可以通過檢查事務 ID 的狀態來判斷是否已經執行過。

### 3. 空回滾 (Empty Rollback)

**挑戰**: 事務協調器在調用參與者的 `Try` 接口時，因為網絡超時等原因，沒有收到回應，於是決定回滾。但此時 `Try` 請求可能根本沒到達參與者。協調器直接調用 `Cancel` 接口，參與者收到一個沒有對應 `Try` 的 `Cancel` 請求，這就是「空回滾」。
**應對**: `Cancel` 接口需要能處理這種情況，例如，查詢不到對應的 `Try` 記錄時，直接返回成功。

### 4. 資源懸掛 (Resource Suspension)

**挑戰**: `Try` 請求因為網絡擁堵，比 `Cancel` 請求更晚到達參與者。`Cancel` 執行了空回滾後，遲到的 `Try` 請求才到達並預留了資源。此時事務已經結束，這個被預留的資源將永遠無法被 `Confirm` 或 `Cancel`。
**應對**: 這是 TCC 中最複雜的問題。需要在參與者端增加一個事務狀態表，並在執行 `Try` 時檢查事務狀態是否已經是「已取消」，如果是，則拒絕預留資源。

## 總結

TCC 模式是一種強大但複雜的分布式事務解決方案。

*   **優點**: 性能好、吞吐量高，將控制權交給業務層，實現了數據的最終一致性。
*   **缺點**: 業務侵入性強，開發複雜度高，需要處理冪等、空回滾、資源懸掛等問題。

在選擇是否使用 TCC 時，需要仔細評估業務場景的複雜度和對一致性的要求。

### 適用場景

**適合使用 TCC 的場景：**
* **金融交易**：銀行轉帳、支付、結算等對一致性要求極高的場景
* **電商訂單**：涉及庫存扣減、優惠券使用、積分扣減的下單流程
* **積分系統**：跨系統的積分轉移、兌換操作
* **資源預訂**：酒店、機票等需要預留資源的業務

**不適合使用 TCC 的場景：**
* 對一致性要求不高的日誌記錄、統計分析
* 業務邏輯簡單、參與方較少的操作
* 開發資源有限、無法承受高開發成本的項目

TCC 是一個值得考慮的選項，但需要團隊具備相應的技術實力和開發資源。

## 參考資料
*   [Seata TCC 模式](https://seata.io/zh-cn/docs/dev/mode/tcc-mode/)
*   [微服務架構的分布式事務解決方案](https://www.cnblogs.com/savorboard/p/distributed-system-transaction-consistency.html)
*   [TCC 分散式事務架構設計與實現](https://tech.meituan.com/2018/11/15/dianping-tcc.html)
