---
title: '[Postgresql]Row-Level Security(RLS)'
date: 2022-03-22 16:33:29
tags:
  - PostgreSQL
  - sql
categories: 工作
toc: true
---

我們在一般的database對使用者的權限只能到table級別，例如某個使用者始能查詢到哪些table。PostgreSQL從9.5版本開始支援Row及別的權限控管，允許不同的使用者在同一個table上查詢到不同的數據。

<!-- more -->

## 如何建立RLS

### table開啟RLS

第一步，我們在想要設定RLS的table輸入以下指令

```sql
ALTER TABLE ... ENABLE ROW LEVEL SECURITY
```

### 建立安全原則

接下來，我們需要制定此RLS的安全原則來限制使用者能有什麼相關的動作

```sql
CREATE POLICY name ON table_name
    [ AS { PERMISSIVE | RESTRICTIVE } ]
    [ FOR { ALL | SELECT | INSERT | UPDATE | DELETE } ]
    [ TO { role_name | PUBLIC | CURRENT_USER | SESSION_USER } [, ...] ]
    [ USING ( using_expression ) ]
    [ WITH CHECK ( check_expression ) ]
```

對於 create policy 中，需要注意:

1. **using**針對已經存在的紀錄驗證，可以實施在select、update、delete、ALL上
2. **with check**針對將要新增的紀錄驗證上，可以實施在insert、update、ALL上

- Policies Applied by Command Type

| | Command | `SELECT/ALL policy` | `INSERT/ALL policy` | `UPDATE/ALL policy` | `DELETE/ALL policy` |
| - | - | - | - | - | - |
| | `USING expression` | `WITH CHECK expression` | `USING expression` | `WITH CHECK expression` | `USING expression`|
| `SELECT` | Existing row | — | — | — | — |
| `SELECT FOR UPDATE/SHARE` | Existing row | — | Existing row | — | — |
| `INSERT` | — | New row | — | — | — |
| `INSERT ... RETURNING` | New row | New row | — | — | — |
| `UPDATE` | Existing & new rows | — | Existing row | New row | — |
| `DELETE` | Existing row | — | — | — | Existing row |
| `ON CONFLICT DO UPDATE` | Existing & new rows | — | Existing row | New row | — |

> If read access is required to the existing or new row (for example, a `WHERE` or `RETURNING` clause that refers to columns from the relation).

更多內容可參閱： [Create Policy](https://docs.postgresql.tw/reference/sql-commands/create-policy)

## 例子

我們通過一個簡單的例子來看如何使用

1. 首先建立測試的table

   ```sql
   test=# create table t1 (id int, name text);
   CREATE TABLE
   test=# insert into t1 values(1, 'user01');
   INSERT 0 1
   test=# insert into t1 values(2, 'user02');
   INSERT 0 1
   test=# select * from t1;
    id |  name  
   ----+--------
     1 | user01
     2 | user02
   (2 rows)
   ```

2. 新建一個使用者

   ```sql
   test=# create user user01;
   CREATE ROLE
   test=# GRANT SELECT, INSERT, UPDATE, DELETE ON public.t1 TO user01;
   GRANT
   ```

3. 開啟RLS

   ```sql
   test=# ALTER TABLE t1 ENABLE ROW LEVEL SECURITY;
   ALTER TABLE
   ```

4. 建立安全原則: `使用者名稱`與table裡的`name`相同，才能有權限對此資料做選取動作

   ```sql
   test=# CREATE POLICY select_on_t1 ON t1 FOR select USING (current_user=name);
   CREATE POLICY
   test=# \d t1
                    Table "public.t1"
    Column |  Type   | Collation | Nullable | Default 
   --------+---------+-----------+----------+---------
    id     | integer |           |          | 
    name   | text    |           |          | 
   Policies:
    POLICY "select_on_t1" FOR SELECT
      USING ((CURRENT_USER = name))
   ```

5. 切換使用者並選取

   ```sql
   test=# \c - user01;
   Password for user user01: 
   You are now connected to database "test" as user "user01".
   test=> select * from t1;
    id |  name  
   ----+--------
     1 | user01
   (1 row)
   ```

   可以看到使用者`user01`只能查看到name=user01的資料

6. 測試新增

   ```sql
   test=> insert into t1 values(3, 'user01');
   ERROR:  new row violates row-level security policy for table "t1"
   ```

   可以看到user01會被RLS規則擋住，這時就要新建一個新增的安全法則

   ```sql
   test=> \c - postgres -- 切換postgres使用者
   Password for user postgres:
   You are now connected to database "test" as user "postgres".

   test=# CREATE POLICY user_add_t1 ON t1 FOR INSERT WITH CHECK(true); -- 建立policy
   CREATE POLICY

   test=# \c - user01 -- 切換回user01
   Password for user user01: 
   You are now connected to database "test" as user "user01".

   test=> insert into t1 values(3, 'user01'); -- 新增資料到t1
   INSERT 0 1

   test=> select * from t1; -- 可以看到剛剛的資料有新增成功
   id |  name  
   ----+--------
   1 | user01
   3 | user01
   (2 rows)
   ```
  
   > `with check`在創建insert的policy時一定要加

7. 測試修改

   ```sql
   test=> update t1 set id=4 where id=3; -- 無法更新
   UPDATE 0

   test=> \c - postgres
   Password for user postgres: 
   You are now connected to database "test" as user "postgres".

   test=# CREATE POLICY user_mod_t1 ON t1 FOR update USING(CURRENT_USER=name); -- 創建更新的安全策略

   CREATE POLICY
   
   test=# \c - user01
   Password for user user01: 
   You are now connected to database "test" as user "user01".

   test=> update t1 set id=4 where id=3; -- 可以更新了
   UPDATE 1

   test=> select * from t1; -- 查看資料
    id |  name  
   ----+--------
     1 | user01
     4 | user01
   (2 rows)

   test=> update t1 set id=5 where id=2; -- 無法修改user02的資料
   UPDATE 0
   ```

## 參考資料

- <https://docs.postgresql.tw/the-sql-language/ddl/row-security-policies>
- <https://docs.postgresql.tw/reference/sql-commands/create-policy>
- <https://foucus.blog.csdn.net/article/details/117331707>
