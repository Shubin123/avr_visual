; stack-demo.asm
; A small demonstration of the call stack: a recursive routine that sums the
; integers 1..N. Each recursive call pushes its argument and return context,
; so you can watch the Stack panel grow and shrink as the program runs.
;
; The result (1 + 2 + ... + N) is returned in r24 and also shown on PORTL.

.cseg
.org 0

start:
    ldi r24, 10            ; N = 10
    rcall sum_to_n         ; returns 1+2+...+10 = 55 in r24
    sts PORTL, r24         ; light the LEDs with the result

hang:
    rjmp hang

; sum_to_n(n): returns n + sum_to_n(n-1), with sum_to_n(0) = 0.
; r24 = n on entry; r24 = sum on return. Uses the hardware stack for the
; recursion, so set a breakpoint here and single-step to watch it unwind.
sum_to_n:
    push r24               ; save n for the recursive call
    push r25               ; (keep the pair aligned / save caller state)

    tst r24                ; if n == 0 ...
    brne recurse
    clr r24                ; ... base case: return 0
    rjmp sum_return

recurse:
    dec r24                ; n-1
    rcall sum_to_n         ; r24 = sum_to_n(n-1)
    mov r25, r24           ; stash the sub-result

    pop r24                ; recover our n
    add r24, r25           ; r24 = n + sum_to_n(n-1)

sum_return:
    pop r25
    pop r24                ; restore the saved n (balanced with the push above)
    ret
