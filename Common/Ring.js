class Ring {
    constructor(capacity) {
        this.length = 0
        this._capacity = capacity
        this._list = new Array(capacity).fill(undefined)
        this._pointer = 0
        this._head = 0
    }

    pop() {
        if (this._checkNull()) return undefined

        this._pointer = this._getPrevious(this._pointer)
        let data = this._list[this._pointer]
        this.length--
        return data
    }

    push(data) {
        this._list[this._pointer] = data
        let index = this._getNext(this._pointer)
        if (this._checkFull()) {
            this._head = index
            this._pointer = index
        } else {
            this._pointer = index
            this.length++
        }
    }

    shift() {
        if (this._checkNull()) return undefined

        let data = this._list[this._head]
        this._head = this._getNext(this._head)
        this.length--
        return data
    }

    unshift(data) {
        let index = this._getPrevious(this._head)
        this._list[index] = data
        if (this._checkFull()) {
            this._head = index
            this._pointer = index
        } else {
            this._head = index
            this.length++
        }
    }

    get(i) {
        if (i < this.length) {
            return this._list[(this._head + i) % this._capacity]
        } else {
            return undefined
        }
    }

    set(i, data){
        if (i < this.length) {
            this._list[(this._head + i) % this._capacity] = data
        }
    }

    slice(start, length){
        start = start || 0
        if(!length || (start + length) > this.length){
            length = this.length - start
        }
        if(start < this.length && start + length <= this.length){
            let ret = new Array(length)
            for(let i = 0; i < length; i++){
                ret[i] = this.get(start + i)
            }
            return ret;
        }else{
            return undefined
        }
    }

    _getNext(num) {
        return (num + 1) % this._capacity
    }

    _getPrevious(num) {
        return (this._capacity + num - 1) % this._capacity
    }

    _checkNull() {
        return this.length === 0
    }

    _checkFull() {
        return this.length === this._capacity
    }

    toString() {
        let str = "[ "
        for (let i = this._head; i < this._head + this.length; i++) {
            let actual_index = i % this._capacity
            str += this._list[actual_index] + " "
        }
        return str + "]"
    }
}

module.exports = Ring
