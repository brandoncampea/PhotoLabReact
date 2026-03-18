# Page snapshot

```yaml
- generic [ref=e2]:
  - navigation [ref=e3]:
    - link "📸 Photo Lab" [ref=e5] [cursor=pointer]:
      - /url: /
    - generic [ref=e6]:
      - link "Albums" [ref=e7] [cursor=pointer]:
        - /url: /albums
      - link "Orders" [ref=e8] [cursor=pointer]:
        - /url: /orders
      - link "Cart" [ref=e9] [cursor=pointer]:
        - /url: /cart
      - link "Login" [ref=e10] [cursor=pointer]:
        - /url: /login
      - link "Register" [ref=e11] [cursor=pointer]:
        - /url: /register
  - generic [ref=e14]:
    - heading "Sign In" [level=1] [ref=e15]
    - paragraph [ref=e16]: Welcome back to Photo Lab
    - generic [ref=e17]:
      - generic [ref=e18]:
        - text: Email
        - textbox "Email" [ref=e19]
      - generic [ref=e20]:
        - text: Password
        - textbox "Password" [ref=e21]
      - button "Sign In" [ref=e22] [cursor=pointer]
    - paragraph [ref=e23]:
      - text: Don't have an account?
      - link "Register" [ref=e24] [cursor=pointer]:
        - /url: /register
```