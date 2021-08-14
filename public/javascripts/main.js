(function () {

  const selectedClientClassName = 'selected-client',
    selectedDateClassName = 'selected-date',
    selectedPeriodClassName = 'selected-period-elem',
    clientClassName = 'client', sectionClientId = 'clients',
    dateClassName = 'day-date', sectionDateId = 'date',
    periodClassName = 'period-element-container', sectionPeriodId = 'period',
    periodElemClassName = 'period-elem',
    sectionPayrollId = 'payroll-select';

  window.addEventListener("load", () => {

    const agent = new UIAgent();

    //Load from local storage if present;
    const clients = JSON.parse(window.localStorage.getItem('clients'));
    if (clients) agent.parseClients(clients);

    const dateKeys = JSON.parse(window.localStorage.getItem('date-keys'));
    let data = {};
    if (dateKeys) dateKeys.forEach(k => { data[k] = JSON.parse(window.localStorage.getItem(k)) });
    else window.localStorage.setItem('date-keys','[]');
    agent.parseData(data);

    agent.createClientsElemList();
    agent.onPeriodChange();
    //End of load

    document.getElementById(sectionClientId).addEventListener("click", ev => {
      if (ev.target.classList.contains(clientClassName)) {
        agent.selectClient(ev.target);
      }
      if (ev.target.tagName === 'SPAN') {
        agent.selectClient(ev.target.parentElement);
      }
    })

    document.getElementById(sectionDateId).addEventListener("click", ev => {
      if (ev.target.classList.contains(dateClassName)) {
        agent.selectDate(ev.target);
      }
    })

    document.getElementById(sectionPeriodId).querySelectorAll('.' + periodClassName).forEach(e => e.addEventListener('click', e => {
      if (e.target.classList.contains(periodClassName))
        agent.selectPeriodContainer(e.target);
      if (e.target.classList.contains('horizontal-line') || e.target.classList.contains('hour-name'))
        agent.selectPeriodContainer(e.target.parentElement);
    }))

    document.getElementById(sectionPeriodId).addEventListener("click", ev => {
      if (ev.target.classList.contains(periodElemClassName)) {
        agent.selectPeriod(ev.target);
      }
      if (ev.target.tagName === "SPAN") {
        agent.selectPeriod(ev.target.parentElement);
      }
      if (ev.target.classList.contains('period-popup')) {
        agent.resetMovePopup(ev.target);
      }
    })

    document.getElementById('add-client').addEventListener('click', e => {
      agent.addClient()
    })

    //document.addEventListener('selection change', agent.selectionChangeEvListener);

    document.getElementById('prePayroll').addEventListener('click', ()=>{agent.selectPayroll(-1);});
    document.getElementById('nextPayroll').addEventListener('click', ()=>{agent.selectPayroll(1);});

  })



  const graphReverse = Symbol('reverse');

  /**
   * @property {String} name - Node name
   */
  class Client {

    constructor(name, args = {}) {
      if (typeof name === "string" && name.length > 0)
        this.name = name;
      if (Object.keys(args).length) {
        for (let key in args) {
          this[key] = args[key];
        }
      }
      if (!args.adjacencyList) {
        this.adjacencyList = {};
        this.adjacencyList[this.name] = {d:0,t:0};
      }
    }

    getReverse(name) { // used to bind
      return this.adjacencyList[name];
    }

    addToList(client,edge) {
      if (!client && (!edge.d || !edge.t)) throw new Error('All arguments required!');
      let node = this.adjacencyList[client.name];
      if (!node) node = {};
      if (edge.d) node.d = Number(edge.d);
      if (edge.t) node.t = Number(edge.t);
    }

    static setBinds (fromClient, toClient) {
      if (!fromClient.adjacencyList[toClient.name]) fromClient.adjacencyList[toClient.name] = {};
      fromClient.adjacencyList[toClient.name][graphReverse] = 
      toClient.getReverse.bind(toClient, fromClient.name);

      if (!toClient.adjacencyList[fromClient.name]) toClient.adjacencyList[fromClient.name] = {};
      toClient.adjacencyList[fromClient.name][graphReverse] = 
      fromClient.getReverse.bind(fromClient, toClient.name);
    }

    static saveClientList (clientList) {
      window.localStorage.setItem('clients', JSON.stringify(clientList))
    }
  }

  const dayStarts = 6;
  const dayEnds = 22;
  const worthGoingHome = 0.5;

  /**
   * @property {Number} start - 6 <= x <= 22, integer representation of time of day
   * @property {Number} finish - finish > start
   * @extends Client
   */
  class JobPeriod {
    constructor(client, arg = { start: null, finish: null, index: undefined, parent: undefined }) {
      if (client instanceof Client) 
        {this.name = client.name; this.client = client;} else {throw new Error('Not a Client!')}
      this.addOrMod({ s: arg.start, f: arg.finish });
      this.index = arg.index; this.parent = arg.parent; // 😑 should be avalable after adding on DayData.add
    }
    static copy(jobPeriod) {
      return new JobPeriod(jobPeriod.client, {
        start: jobPeriod.start, finish: jobPeriod.finish,
        index: jobPeriod.index, parent: jobPeriod.parent
      });
    }

    /**
     * @param {Number|Object} value number or {n.s:number,n.f:number}
     * @param {Object} opts
     * @param {String} opts.rangeNodeName if value is typeof number -> this[rangeNodeName:<'s'/'start'|'f'/'finish'>]
     * @param {Boolean} opts.mod default false
     * 
     * @todo problem is if i modifiy existing data i need to check Collision in current day data??
     */
    addOrMod(value, opts = { rangeNodeName: null, mod: false }) {
      let error = (val, str = "Wrong value supplied") => new TypeError(str + ':' + val),
        testNum = () => typeof value === "number" && value >= dayStarts && value < dayEnds,
        testObj = (key) => typeof value[key] === "number" && value[key] >= dayStarts && value[key] < dayEnds,
        modify = function (range) {
          if (opts.mod) {
            const bkup = JobPeriod.copy(this);
            this.parent.remove(this.index);
            if (range) {
              if (1 - Number(value) % 1 < 0.0001) value = Math.round(Number(value));
              switch (range) { case 's': { this.start = value; break; } case 'f': { this.finish = value; break; } }
            } else {
              if (1 - Number(value.s) % 1 < 0.0001) value.s = Math.round(Number(value.s));
              if (1 - Number(value.f) % 1 < 0.0001) value.f = Math.round(Number(value.f));
              this.start = value.s; this.finish = value.f;
            }
            this.index = this.parent.insertIfNoCollision(this);
            if (!(this.index >= 0)) {
              this.parent.add(bkup, { noCollisionTest: true })
              throw error(value, "Collision error!");
            } else if (this.index !== bkup.index)
              this.parent.resetChildIndex();
          }
        };

      if (typeof value === 'number') {
        switch (opts.rangeNodeName) {
          case 's': case 'start': { if (testNum() && value < this.finish) { modify.call(this, 's'); this.start = value; break; } else throw error(value) };
          case 'f': case 'finish': { if (testNum() && value > this.start) { modify.call(this, 'f'); this.finish = value; break; } else throw error(value) };
          default: throw error(opts.rangeNodeName);
        }
      } else
        if (typeof value === 'object' && (testObj('s') || testObj('start')) && (testObj('f') || testObj('finish'))) {
          if (value.s > value.f) throw new Error("Can't finish earlier than you started.");
          modify.call(this);
          this.start = value.s; this.finish = value.f;
        } else { throw error(value) }
    }

  }



  /**
   * @property {Array} day List of JobPeriod
   */
  class DayData {

    constructor(job) {
      this.day = [];
      this.add(job);
    }

    add(job, opts = { noCollisionTest: false }) {
      if (job instanceof JobPeriod) {
        if (opts.noCollisionTest !== true) {
          job.index = this.insertIfNoCollision(job);
          job.parent = this;
        } else this.day.splice(job.index, 0, job);
      }
      else { console.warn(`Schema error of job:\n${job}`); return false };
    }

    remove(jobIndex) {
      this.day.splice(jobIndex, 1);
    }

    move(jobIndex, timeIndex) {
      const job = JobPeriod.copy(this.day[jobIndex]),
        range = job.finish - job.start;
      try {
        job.addOrMod({ s: dayStarts + timeIndex / 4, f: dayStarts + range + timeIndex / 4 }, { mod: true });
      } catch (e) {
        console.warn(e);
        return false;
      }
    }

    resetChildIndex() {
      for (let [i, jobPeriod] of this.day.entries())
        jobPeriod.index = i;
    }

    get(i) { return typeof i === 'number' ? this.day[i] : this.day }

    normalize() { return this.day.map(e => { return { name: e.name, start: e.start, finish: e.finish } }) }

    /**
     * @param {String||Number | Object{h,m}} data String | Number returns "minutes" ({h,m}); If obj, returns Number h.(m/60)
     */
    static convertTime(data) {
      let tofdata = typeof data, error = new Error("Wrong range hours supplied. h:", +data);
      let testRange = function (min, max) { return this.valueOf() >= min && this.valueOf() <= max ? true : false }; Number.prototype.testRange = testRange;
      switch (tofdata) {
        case "string": case "number": { let n = Number(data); if (n.testRange(dayStarts, dayEnds)) { return { h: String(n - n % 1), m: String(Math.round(n % 1 * 60)) } } else throw error };
        case "object": { let [h, m] = [(() => Number(data.h))(), (() => Number(data.m))()]; if (h.testRange(dayStarts, dayEnds) && m.testRange(0, 59)) { return Math.round(h) + m / 60 } else throw error };
        default: { throw new TypeError("Wrong data provided; should be eithere string|number || {h,m} but found: " + typeof data) }
      }
    }

    /**
     * This code is too smart therefore i'm too dumb to debug it, but quite proud of myself anyway
     * @param {Object} newJob
     * @returns {Number} the list index of inserted data, undefined if collision
     */
    insertIfNoCollision(newJob) {
      let noCollision = true,
        i = 0, insertIndexFound = false;

      for (let thisJob of this.day) {
        let laterThen = thisJob.start < newJob.finish,
          earlierThen = thisJob.finish > newJob.start;
        // change <= to < and >= to >; to exclude exact match
        if (laterThen && earlierThen) {
          noCollision = false; break;
        }

        if (!insertIndexFound) {
          if (laterThen) i++;
          else insertIndexFound = true;
        }
      }

      if (noCollision) {
        this.day.splice(i, 0, newJob);
        return i;
      }
    }

    /**
     * Calculates travell data based on JobPeriod in the list
     * @todo Not sure if it should be stored as it gets changed quite often, but then on calculateing on each load and as the list grows it could get expensive.
     * @todo Focus on designing the rules. If this.day.lenght > 2 check if it is possible to travel home;
     * @todo If not, both travel period should point to the same object; this.travelData[i] - i coresponds to this.day[i]
     * @todo 
     */
    async getTravelData (agent) {
      this.travelData = this.day.map(job => {
        let time = {before: {s:null,f:null}, after: {s:null,f:null}};
        time.before.f = job.start; time.before.s = job.start - (job.client.tfh?job.client.tfh/60:(job.client.tth?job.client.tth/60:0.25)); // Default travel time is 15 minutes
        time.after.s = job.finish; time.after.f = job.finish + (job.client.tth?job.client.tth/60:(job.client.tfh?job.client.tfh/60:0.25));
        let dist = {before: null, after: null};
        dist.before = job.client.dfh; dist.after = job.client.dth;
        return {time, dist};
      })

      for (let i = 1; i<this.travelData.length; i++) {//on every 2 destination
        if (this.travelData[i-1].time.after.f + worthGoingHome > this.travelData[i].time.before.s) {//if it doesn't worth going home
          let fromClient = this.travelData[i-1], toClient = this.travelData[i];
          fromClient.time.after.f = toClient.time.before.f; //let the first destination arriving time be equal of the secound destination arriving time
          toClient.time.before.s = null; toClient.time.before.f = null; //lets not focus on times before arriving
          toClient.dist.before = null;

          const graph = this.day[i-1].client.adjacencyList;
          const client = this.day[i-1].client;

          if (! graph[this.day[i].name]) {
            let data = await agent.getTravelInfoFor(this.day[i-1].client,this.day[i].client);
            client.addToList(this.day[i].client, {d:data.dist, t:data.travelT});
            Client.setBinds(this.day[i-1].client, this.day[i].client);
          } else if (! graph[this.day[i].name].d || ! graph[this.day[i].name].t){
            let data = await agent.getTravelInfoFor(this.day[i-1].client,this.day[i].client);
            client.addToList(this.day[i].client, {d:data.dist, t:data.travelT});
          }

          fromClient.dist.after = graph[this.day[i].name].d || graph[this.day[i].name][graphReverse]().d || null;
          toClient.time.before.wait = fromClient.time.after.f - fromClient.time.after.s - graph[this.day[i].name].t/60;
          fromClient.time.after.f -= toClient.time.before.wait;
        } else { //if it does worth taking a quick nap or grab a sandwich or just pee and not just sit in the car like a fucking idiot 
          
        }
      }

      return this.travelData;
    }
  }


  /**
   * @param {Period} loadData instanceOf PeriodData
   */
  class Period {
    constructor(loadData) { this.data = loadData instanceof Period ? loadData.data : {} }

    /**
     * @param {Date|String} dayDateSplit converts to or expects 'new Date().toISOString().split("T")[0]' ex.: '2020-06-14'
     */
    add(dayDateSplit_key, day = new DayData()) {
      if (dayDateSplit_key instanceof Date) {
        dayDateSplit_key = Period.getDayDateSplit_key(dayDateSplit_key, false);
        this.data[dayDateSplit_key] = day;
      }
      else if (typeof dayDateSplit_key === "string" && dayDateSplit_key.match(/^\w{4}-\w{1,2}-\w{1,2}$/))
        this.data[dayDateSplit_key] = day;
    }

    static getDayDateSplit_key(date, test = true) {
      if (test) {
        if (date instanceof Date) return date.toISOString().split("T")[0];
        else throw new TypeError(`date is not instance of Date`);
      } else
        return date.toISOString().split("T")[0];
    }

    normalize() {
      const normalObj = {};
      for (let date_key in this.data) {
        const data = this.data[date_key].normalize();
        if (data.length)
          normalObj[date_key] = data;
      }
      return normalObj;
    }

    save(dateKey, opts = {remove: false}) {
      if (this.data[dateKey].get().length || opts.remove) {
        const dateKeys = window.localStorage.getItem('date-keys');
        if ( dateKeys && JSON.parse(dateKeys).includes(dateKey) ) {
          if (opts.remove && this.data[dateKey].get().length === 0) {
            window.localStorage.removeItem(dateKey);
            const dateKeys = JSON.parse(window.localStorage.getItem('date-keys'));
            dateKeys.splice(dateKeys.indexOf(dateKey),1);
            window.localStorage.setItem('date-keys',JSON.stringify(dateKeys));
            return;
          } 
          window.localStorage.setItem( dateKey, JSON.stringify(this.data[dateKey].normalize()) );
        } else {
          const parsedKeys = JSON.parse(dateKeys);
          parsedKeys.push(dateKey);
          window.localStorage.setItem( 'date-keys', JSON.stringify(parsedKeys) );
          window.localStorage.setItem( dateKey, JSON.stringify(this.data[dateKey].normalize()) );
        }
      }
    }

  }






  class UIAgent {

    constructor(options = { date: new Date() }) {
      this.selectedClient = { node: null, name: null }
      this.selectedDate = new PayrollSelectAgent(options);
      this.selectedPeriod = { node: null, data: null };

      this.clientList = [];

      this.period = new Period();
      this.period.add(options.date);

      this.periodElemList = [];

      this.selectPayroll(0);

      this.popupActive = null;

    }

    createPopup(customEvHandler) {
      if (this.popupActive === null) {
        window.scrollTo(0,0);
        const popupBgMask = document.createElement('section');
        popupBgMask.classList.add('popup-bg-mask');
        document.body.style.overflow = 'hidden';
        document.body.insertBefore(popupBgMask, document.body.childNodes[0]);
        const defaultEvListener = e => {
          if (e.target.classList.contains('popup-bg-mask')) {
            document.body.removeAttribute('style');
            e.target.remove();
            if (typeof customEvHandler === 'function') customEvHandler();
            this.popupActive = null;
          }
        }
        popupBgMask.addEventListener('click', defaultEvListener)
        const popupContent = document.createElement('span');
        popupContent.classList.add('popup-content');
        popupBgMask.append(popupContent);
        this.popupActive = popupBgMask;

        return popupContent;
      } else {
        throw new Error("Can't create popup, one is already active:\n" + this.popupActive)
      }
    }

    selectionChangeEv(opts = {changeMove: true, dropSelectedForMove: true, dropSelectedNode: true}) {
      if (this.selectedPeriod.node) {
        if (opts.changeMove) this.selectedPeriod.node.classList.remove('selected-period'); 
        if (opts.dropSelectedForMove) delete this.selectedPeriod.selectedForMoveIndex;
        if (opts.dropSelectedNode) {this.selectedPeriod.node.classList.remove(selectedPeriodClassName);
          this.selectedPeriod.node = null; this.selectedPeriod.data = null;
        }
      }

      if (this.selectedClient.node) {
        this.selectedClient.node.classList.remove(selectedClientClassName);
        this.selectedClient.node.querySelectorAll('.period-elem-button').forEach(e=>e.classList.add('hidden-buttons'));
      }
      this.selectedClient.node = null; this.selectedClient.name = null;
    }

    selectDate(element) {
      if (!element.classList.contains(selectedDateClassName)) {
        //deselect previously selected
        if (this.selectedDate.node)
          this.selectedDate.node.classList.remove(selectedDateClassName);
        //add newly selected
        this.selectedDate.node = element;
        this.selectedDate.index = UIAgent.findNthParent(element);
        //set selected class name
        element.classList.add(selectedDateClassName);

        const selectedDate = element.getAttribute('value');

        let year = this.selectedDate.date.getFullYear();
        
        if (this.selectedDate.payroll.startMonth === 11) { // if payroll start month is Dec
          if (this.selectedDate.date.getMonth() === 11) { // curently selected date is IN Dec
            if (this.selectedDate.payrollStarts > selectedDate.split('-')[1]) { // newly chosen is not Dec
              year+=1; // the year should be larger than the currently selected date year
            }
          } else {  // curently selected is NOT in Dec
            if (this.selectedDate.payrollStarts <= selectedDate.split('-')[1]) { // newly chosen is Dec
              year-=1; // the year should be smaller than the currently selected date year
            }
          }
        }

        const isoDate = new Date(`${year}-${selectedDate}`);

        this.date = new Date(isoDate);
        this.selectedDate.dateKey = Period.getDayDateSplit_key(isoDate);
        if (this.period.data[this.selectedDate.dateKey] === undefined) this.period.add(this.selectedDate.dateKey);
        if (this.selectedPeriod.node) this.resetMovePopup(this.selectedPeriod.node);
        this.onPeriodChange();
      }
    }

    selectPayroll (direction) {
      this.selectionChangeEv();
      this.selectedDate.setPayroll(direction);
      let dk = this.selectedDate.dateKey.split('-');
      this.selectDate(document.getElementById('dateList').querySelector(`.day-date[value="${dk[1]+'-'+dk[2]}"]`));
      this.onPeriodChange();
    }

    selectClient(element) {
      this.selectionChangeEv();
      this.selectedClient.node = element;
      this.selectedClient.name = element.children[0].innerText;
      element.querySelectorAll('.period-elem-button').forEach(e=>e.classList.remove('hidden-buttons'));
      element.classList.add(selectedClientClassName);
    }

    createClientSettingEvHandler(client) {
      const clientI = this.findClientFromList(client, {getIndexOnly:true});
      return ()=>{
        const [submit, iL, iElemList, popup] = this.createClientSettings({submitText:'Update Client'});
        submit.remove();
        iL.shift(); iElemList[0].remove(); iElemList.shift(); // remove Client name input field, prob. there would cause alot more work to rename everithing...
        const heading = document.createElement('h2'); heading.innerText = `${client.name} data:`;
        popup.insertBefore(heading, popup.firstElementChild); // just show the name selected
        iElemList.forEach((e,i)=>{ e.querySelector(`#${iL[i].id}`).value = client[iL[i].id]; }); // show the previous values

        let clientAdjSettingsElem = []
        for (let [i,toClient] of this.clientList.entries()) {
          if (i === clientI) continue;
          const heading = document.createElement('h3'); heading.innerText = `From ${client.name} to ${toClient.name}:`;
          const dist = UIAgent.addInputForPopup({labelText: 'Distance in Miles:', labelFor: `${toClient.name}-dist`, inputType: 'number'}),
            travelT = UIAgent.addInputForPopup({labelText: 'Travel time in Minutes:', labelFor: `${toClient.name}-time`, inputType: 'number'});
          
          if (client.adjacencyList[toClient.name]) {
            dist.children[1].value = client.adjacencyList[toClient.name].d;
            travelT.children[1].value = client.adjacencyList[toClient.name].t;
          }

          clientAdjSettingsElem = [...clientAdjSettingsElem, heading, dist, travelT];
        }

        popup.append(...clientAdjSettingsElem,submit);

        submit.addEventListener('click', ()=>{
          iElemList.forEach((e,i)=>{ client[iL[i].id] = e.querySelector(`#${iL[i].id}`).value});

          clientAdjSettingsElem.forEach((e)=>{
            const inp = e.querySelector(`input`);
            if (! inp) return; 
            const id = inp.getAttribute('id'), [name,type] = id.split('-');
            switch (type) {
              case 'dist': {client.addToList({name:name},{d:inp.value}); break;}
              case 'time': {client.addToList({name:name},{t:inp.value}); break;}
            }
          })

          popup.parentElement.click();
          Client.saveClientList(this.clientList);
        })
      }
    }

    createClientDeleteEvHandler(client) {
      return e=>{
        if (window.confirm(`Are you sure you want to delete ${client.name} from the list?`)) {
          this.clientList.splice(this.findClientFromList(client, {getIndexOnly:true}),1);
          e.target.parentElement.remove();
          Client.saveClientList(this.clientList);
        }
      }
    }

    createClientsElemList() {
      this.clientList.forEach(client => {
        this.createClientElem({
          name: client.name,
          delEvHandler: this.createClientDeleteEvHandler(client),
          settingEvHandler: this.createClientSettingEvHandler(client),
        });
      })
    }

    createClientElem(opts={name:null, delEvHandler: null, settingEvHandler: null}) {
      const clientElem = document.createElement('div'), 
        clientName = document.createElement('span'),
        settingsClient = document.createElement('div'),
        deleteClient = document.createElement('div');
      settingsClient.classList.add('period-elem-button','setting-period','hidden-buttons');
      deleteClient.classList.add('period-elem-button','delete-period','hidden-buttons');
      clientElem.classList.add(clientClassName); clientName.innerText = opts.name;
      clientElem.append(clientName, settingsClient, deleteClient);
      if (opts.settingEvHandler) settingsClient.addEventListener('click',opts.settingEvHandler);
      if (opts.delEvHandler) deleteClient.addEventListener('click',opts.delEvHandler);
      document.getElementById(sectionClientId).append(clientElem);
    }

    createClientSettings(opts = {submitText: null}) {
      const popup = this.createPopup(),
        inputList = [
          {id:'client-name',text:'New Client name:',type:'text'},
          {id:'pc',text:'Postcode:',type:'text'},
          {id:'dfh',text:'Distance from home:',type:'number'},
          {id:'dth',text:'Distance to home:',type:'number'},
          {id:'tfh',text:'Travel time from home:',type:'number'},
          {id:'tth',text:'Travel time to home:',type:'number'}
        ],
        inputElemList = inputList.map(obj => 
          UIAgent.addInputForPopup({labelFor:obj.id, labelText:obj.text, inputType:obj.type}) );

      popup.append(...inputElemList);

      const submit = document.createElement('button'); submit.innerText = opts.submitText;
      popup.append(submit);

      return [submit, inputList, inputElemList, popup];
    }

    addClient() {
      const [submit, inputList] = this.createClientSettings({submitText: 'Add Client'});

      submit.addEventListener('click', e => {
        let client;
        if (! e.target.parentElement.querySelector(`#${inputList[0].id}`).value) {
          alert('Can\'t create client whithout a name!');
          throw new Error('Can\'t create client whithout a name!');
        }
        for (let data of e.target.parentElement.querySelectorAll('.popup-input')) {
          let nameInputElem = data.querySelector(`#${inputList[0].id}`),
              otherInputElem = data.querySelector('input');
          if (nameInputElem) {
            client = new Client(nameInputElem.value);
            nameInputElem.value = '';
          } else if (otherInputElem){
            client[otherInputElem.getAttribute('id')] = Number(otherInputElem.value)?Number(otherInputElem.value):otherInputElem.value;
            otherInputElem.value = '';
          }
        }

        this.clientList.push(client);

        this.createClientElem({name: client.name, 
          settingEvHandler: this.createClientSettingEvHandler(client), 
          delEvHandler: this.createClientDeleteEvHandler(client)});
        
        Client.saveClientList(this.clientList);
      })
    }

    static addInputForPopup (opts = {labelFor:null, labelText: null, inputType: 'text'}) {
      const span = document.createElement('span'); span.classList.add('popup-input')
      const nameLabel = document.createElement('label');
      nameLabel.setAttribute('for', opts.labelFor); nameLabel.innerText = opts.labelText;
      const name = document.createElement('input');
      name.setAttribute('id', opts.labelFor); name.setAttribute('type', opts.inputType);
      span.append(nameLabel, name);
      return span;
    }

    selectPeriodContainer(target) {
      const i = UIAgent.findNthParent(target) - 1;
      if (this.selectedClient.node) {
        const jobPeriod = new JobPeriod(this.clientList[UIAgent.findNthParent(this.selectedClient.node) - 1],
          {
            start: dayStarts + i / 4,
            finish: dayStarts + i / 4 + 0.5
          })
        this.period.data[this.selectedDate.dateKey].add(jobPeriod);
        this.period.data[this.selectedDate.dateKey].resetChildIndex();
        this.selectionChangeEv();
      } else if (this.selectedPeriod.node) {
          if (this.period.data[this.selectedDate.dateKey]
            .move(UIAgent.findIndexOfPeriodElem(), UIAgent.findNthParent(target) - 1)
            !== false) {
            //target.append(this.selectedPeriod.node);
            this.selectionChangeEv();
          }
        }
      this.onPeriodChange();
    }

    

    selectPeriod(target, opts = { dontListenForMove: false, trigerSelectionEv: true}) {
      if (opts.trigerSelectionEv) this.selectionChangeEv();
      this.selectedPeriod.node = target; target.classList.add(selectedPeriodClassName);
      //this.selectedPeriod.data = this.period.data[this.selectedDate.dateKey].get(UIAgent.findIndexOfPeriodElem(selectedPeriodClassName));
      if (opts.dontListenForMove) { target.classList.remove(selectedPeriodClassName) }
    }

    removePeriod(target) {
      const period = target.parentElement;
      period.classList.add('selected-period');
      this.period.data[this.selectedDate.dateKey].remove(UIAgent.findIndexOfPeriodElem('selected-period'));
      period.remove();
      this.period.save(this.selectedDate.dateKey, {remove:true});
    }

    movePeriod(target, opts = {notEvent: false}) {
      let elem;
      if (opts.notEvent) {
        this.selectionChangeEv();
        target.classList.add('selected-period');
        this.selectPeriod(target, { dontListenForMove: true , trigerSelectionEv: false});
      } else {
        this.selectionChangeEv();
        target.parentElement.classList.add('selected-period');
        this.selectPeriod(target.parentElement, { dontListenForMove: true , trigerSelectionEv: false});
      }
      this.selectedPeriod.selectedForMoveIndex = UIAgent.findIndexOfPeriodElem('selected-period');

      elem = this.selectedPeriod.node;
      elem.querySelectorAll('.period-elem-button').forEach(e=>e.classList.add('hidden-buttons'));
      elem.append(this.createPeriodSettingPopup());
    }

    resetMovePopup (target) {
      target.parentElement.querySelectorAll('.hidden-buttons').forEach(e=>e.classList.remove('hidden-buttons'));
      target.remove();
      this.selectionChangeEv();
    } 

    createPeriodSettingPopup() {
      const popup = document.createElement('div');
      popup.classList.add('period-popup');
      const createBtn = function (innerText, classList = []) {
        const btn = document.createElement('div');
        btn.classList.add('period-move-btn');
        for (let cl of classList) btn.classList.add(cl);
        btn.innerText = innerText;
        return btn;
      }

      const $ = (t)=>t.classList;

      const cn = {
        small: 'period-move-btn-small',
        step5: 1/12, step15: 1/4,
        up: 'period-move-btn-up',
        down: 'period-move-btn-down',
        minus: 'period-move-btn-minus',
        c: 'contains',
        isItUp: function(t){return $(t)[this.c](this.up)?-1:1},
        isItSmall: function(t){return $(t)[this.c](this.small)?this.step5:this.step15},
        isItMinus: function(t){return $(t)[this.c](this.minus)?-1:1},
        whatIsIt: function(t){return this.isItUp(t)*this.isItSmall(t)*this.isItMinus(t)}
      }

      const children = [createBtn('+', [cn.up]), createBtn('+', [cn.up, cn.small]), createBtn('-', [cn.up, cn.minus]), createBtn('-', [cn.up, cn.small, cn.minus]),
                    createBtn('+', [cn.down]), createBtn('+', [cn.down, cn.small]), createBtn('-', [cn.down, cn.minus]), createBtn('-', [cn.down, cn.small, cn.minus])];
      children.forEach(el => {
        popup.append(el);
        el.addEventListener('click', e => {
          try {
            let data = this.period.data[this.selectedDate.dateKey].get(UIAgent.findIndexOfPeriodElem('selected-period'));
            data.addOrMod(
              (cn.isItUp(e.target)<0?data.start:data.finish)
              + cn.whatIsIt(e.target), { rangeNodeName: cn.isItUp(e.target)<0?'s':'f', mod: true });
            this.onPeriodChange();
          } catch (e) {
            console.warn(e);
          }
        })
      })
      return popup;
    }

    async getTravelInfoFor(fromClient, toClient) {
      if (! (fromClient instanceof Client) || ! (toClient instanceof Client)) {throw new TypeError('Not Client type!')}
      //const customCancelEv = ()=>{};
      const popup = this.createPopup(/*customCancelEv*/), submit = document.createElement('button'); submit.innerText = 'Save';
      const heading = document.createElement('h3'); heading.innerText = `From ${fromClient.name}:`;
      const dist = UIAgent.addInputForPopup({labelText:`Distance to ${toClient.name} in Miles:`,labelFor:'dist',inputType:'number'});
      const travelT = UIAgent.addInputForPopup({labelText:`Travel time to ${toClient.name} in Minutes:`,labelFor:'travelT',inputType:'number'});
      popup.append( heading, dist, travelT, submit);

      let reverse; // i know this has no use here because the other client is present tho, i finished it and i wanted to see use for it
      if (fromClient.adjacencyList[toClient.name]) reverse = fromClient.adjacencyList[toClient.name][graphReverse]();

      dist.querySelector('input').value = reverse?reverse.d:'';
      travelT.querySelector('input').value = reverse?reverse.t:'';

      //https://stackoverflow.com/questions/51001272/how-do-i-use-promises-with-%C2%B4click%C2%B4-events-without-adding-event-handler-in-the-ex
      const resolveClick = new Promise((res,rej)=>{
        submit.addEventListener('click', ()=>{
          const data = {dist: dist.children[1].value, travelT: travelT.children[1].value};
          popup.parentElement.click();
          res(data);
        }, {once:true})
      })

      return await resolveClick;
    }

    static findNthParent(targetElement, n = 1, opts = { returnParentAndIndex: false, tagetParent: null, targetChild: null }) {
      const parent = (function nthParent(n, elem) { if (n > 1) return nthParent(n - 1, elem.parentElement); return elem.parentElement; }(n, targetElement)),
        index = Array.prototype.indexOf.call(opts.tagetParent ? opts.tagetParent : parent.children, opts.targetChild ? opts.targetChild : targetElement);
      if (opts.returnParentAndIndex) return [parent, index];
      return index; //There is an extra absolute element in the node at the begining; in this case of #period
    }

    static findIndexOfPeriodElem(className) {
      let index;
      document.getElementById(sectionPeriodId).querySelectorAll("." + periodElemClassName).forEach((e, i) => { if (e.classList.contains(className ? className : selectedPeriodClassName)) index = i; })
      return index;
    }

    createPeriodElem (opts = {name: null, start: null, finish: null}) {
      const settingBtn = document.createElement('div'),
            deleteBtn = document.createElement('div'),
            text = document.createElement('span'),
            timeGrid = document.createElement('div'), sTime = document.createElement('div'), fTime = document.createElement('div');
      text.innerText = opts.name;

      settingBtn.classList.add('period-elem-button', 'setting-period');
      deleteBtn.classList.add('period-elem-button', 'delete-period');

      timeGrid.append(sTime, fTime);
      timeGrid.classList.add('time-of-period'); sTime.classList.add('time-elem','start-time'); fTime.classList.add('time-elem','finish-time');
      const s = DayData.convertTime(opts.start), f = DayData.convertTime(opts.finish);
      sTime.innerText = `${s.h}:${s.m.length>1?s.m:'0'+s.m}`; fTime.innerText = `${f.h}:${f.m.length>1?f.m:'0'+f.m}`;

      deleteBtn.addEventListener('click', e => { this.removePeriod(e.target); })
      settingBtn.addEventListener('click', e => {
        let periodElem = document.querySelector('.period-popup');
        if (periodElem) this.resetMovePopup(periodElem);
        this.movePeriod(e.target); 
      })

      return [timeGrid, text, settingBtn, deleteBtn];
    }

    // i'm so sleepy 😥
    async onPeriodChange() {
      //clear periodElemList
      this.periodElemList.forEach(elem => { elem.remove() })
      this.periodElemList = [];
      //create elems from period and add to pElemList
      let elems = Array.from(document.getElementById(sectionPeriodId).getElementsByClassName(periodClassName));
      elems.pop(); // we don't need that last sorry-ass placeholder elem for this! 2am btw

      this.period.data[this.selectedDate.dateKey].get().forEach(
        job => {
          let offBy = (job.start - 6) % 0.25 / 0.25;
          let i = (job.start - 6) / 0.25 - offBy;
          let heightMult = (job.finish - job.start) / 0.25;
          if (i % 1) { console.warn("floating point trouble!!"); i = Math.round(i); }

          const elem = document.createElement('div');

          elem.classList.add(periodElemClassName, clientClassName);
          elem.append(...this.createPeriodElem({ name: job.name, start: job.start, finish: job.finish }) );
          elem.setAttribute("style", "height:" + (elems[0].getBoundingClientRect().height * heightMult - 2) + "px; top:" + elems[0].getBoundingClientRect().height * offBy + "px");

          elems[i].append(elem);

          if (this.selectedPeriod.selectedForMoveIndex === job.index) this.movePeriod(elem,{notEvent:true});

          this.periodElemList.push(elem);
        }
      )

      await this.period.data[this.selectedDate.dateKey].getTravelData(this).then(travelData=>{/*this.calcTravelResults(travelData);*/Client.saveClientList(this.clientList)});
      this.period.save(this.selectedDate.dateKey);
    }

    /*calcTravelResults (travelData) {
      const section = document.getElementById('travelResults');
      let totalTime = 0, totalDist = 0, totalWait = 0, totalHours = 0;

      travelData.forEach((d,i)=>{
        totalDist += d.dist.before?d.dist.before:0;
        totalDist += d.dist.after;
        totalTime += d.time.before.s?(d.time.before.f-d.time.before.s):0;
        totalTime += d.time.after.f-d.time.after.s;
        totalWait += d.time.before.wait?d.time.before.wait:0;
        let day = this.period.data[this.selectedDate.dateKey].get(i);
        totalHours += day.finish - day.start;
      })

      totalTime = DayData.convertTime(totalTime);
      totalDist = DayData.convertTime(totalDist);
      totalWait = DayData.convertTime(totalWait);
      totalHours = DayData.convertTime(totalHours);

      section.innerText = `Total time in trafic ${totalTime.h}:${totalTime.m}, and total distance covered ${totalDist.h}:${totalDist.m}.\n
Total time spent waiting in car ${totalWait.h}:${totalWait.m}, and total hours accumulated on minimum wage ${totalHours.h}:${totalHours.m}.`
    }*/

    findClientFromList (dd, opts={getIndexOnly: false}){
      for (let [i,client] of this.clientList.entries()) {
        if (client.name === dd.name) 
          {if (opts.getIndexOnly) return i; else return client;}
      }
      return new Client(dd.name);
    }

    parseData(data) {
      for (let d in data)
        for (let dd of data[d]) {
          if (this.period.data[d])
            this.period.data[d].add(new JobPeriod(this.findClientFromList(dd), { start: dd.start, finish: dd.finish }));
          else this.period.add(d, new DayData(
            new JobPeriod(this.findClientFromList(dd), { start: dd.start, finish: dd.finish })));
        }

    }

    parseClients(clients) {
      for (let client of clients) {
        this.clientList.push(new Client(client.name, client));
      }
      for (let client of this.clientList) {
        for (let toClientName in client.adjacencyList) {
          if (toClientName === client.name) continue;
          let toClient = this.findClientFromList({name:toClientName},{getIndexOnly:true});
          if (typeof toClient === 'number') {
            toClient = this.clientList[toClient];
            Client.setBinds(client, toClient);
          }
        }
      }
    }
  }



  class PayrollSelectAgent {
    constructor(opts = { date: new Date() }) {
      this.months = PayrollSelectAgent.generateMonthStrFromDate();

      this.today = new Date();
      this.node; this.index; this.date = opts.date;
      this.dateKey = Period.getDayDateSplit_key(opts.date);
      this.payrollStarts = 27;

      this.payroll = this.getPayroll();
    }

    getPayroll () {

      const result = { firstMonth: [], lastMonth: [] };

      result.startMonth = this.startMonthOf(this.date);

      const startMonthLength = PayrollSelectAgent.getMonthLength(new Date(new Date(this.date).setMonth(result.startMonth))),
        nextMonthLength = PayrollSelectAgent.getMonthLength(new Date(new Date(this.date).setMonth(result.startMonth + 1)));

      for (let i = 1; i <= 31; i++) {
        if (i < 29) {
          result.firstMonth.push({ val: i }); result.lastMonth.push({ val: i })
        } else if (i <= startMonthLength || i <= nextMonthLength) {
          if (i <= startMonthLength) result.firstMonth.push({ val: i });
          if (i <= nextMonthLength) result.lastMonth.push({ val: i });
        }
        if (i === this.payrollStarts) {
          result.lastMonth[i - 2].default = true;
          result.defaultEnd = i - 1;
          result.defaultStart = i;
          result.firstMonth[i - 1].default = true;
        }
      }

      let add0toStart = result.startMonth < 9 ? "0" + (result.startMonth + 1) : (result.startMonth + 1),
        add0toEnd = result.startMonth + 1 > 11 ? 0 : result.startMonth + 1;
      add0toEnd = add0toEnd < 10 ? "0" + (add0toEnd + 1) : (add0toEnd + 1);

      result.days = []
      for (let i = result.defaultStart; i <= startMonthLength; i++) {
        result.days.push(add0toStart + "-" + (i < 10 ? "0" + i : i));
      }
      for (let i = 1; i <= result.defaultEnd; i++) {
        result.days.push(add0toEnd + "-" + (i < 10 ? "0" + i : i));
      }

      return result;
    }

    init() {
      const [startDay, startMonth, endDay, endMonth] = document.getElementById(sectionPayrollId)
        .querySelectorAll('select[name]');

      const addDaysFor = function (parent) {
        return function (obj) {
          const option = document.createElement('option');
          option.setAttribute('value', obj.val);
          if (obj.default) option.setAttribute('selected', '');
          option.innerText = obj.val;
          parent.append(option);
        }
      }

      const addMonthsFor = function (parent, selectedMonthIndex) {
        return function (str, i) {
          const option = document.createElement('option');
          option.setAttribute('value', i + 1);
          if (selectedMonthIndex === i) option.setAttribute('selected', '');
          option.innerText = str;
          parent.append(option);
        }
      }

      let month = this.payroll.startMonth;

      this.payroll.firstMonth.forEach(addDaysFor(startDay));
      this.payroll.lastMonth.forEach(addDaysFor(endDay));
      this.months.forEach(addMonthsFor(startMonth, month));
      this.months.forEach(addMonthsFor(endMonth, month + 1 > 12 ? 0 : month + 1));

      let selectedDate;
      if (this.preSelectedDate) { ////////////// SOmEwhere in the future, maybe save last state of the user session
        selectedDate = this.preSelectedDate;
        delete this.preSelectedDate;
      } else {
        selectedDate = this.date.getDate();
      }

      const days = document.getElementById('dateList');
      const dateWidthNBorder = 50;

      this.payroll.days.forEach((date, i) => {
        const div = document.createElement('div');
        div.classList.add(dateClassName);
        div.setAttribute('value', date);
        const day = date.split('-')[1];
        if (day == selectedDate) { /*div.classList.add(selectedDateClassName);*/ this.node = div; this.index = i; };
        div.innerText = date.split('-')[1];
        days.append(div);
      })

      let x = days.offsetWidth / dateWidthNBorder / 2;
      let b = days.scrollWidth / dateWidthNBorder;
      let a = days.scrollWidth - days.offsetWidth;
      let slope = a / (b - 2 * x);
      let f = slope * ((this.index + 1) - (b - x)) + a;

      days.scrollTo(f, 0); // a linear function bested me again! not to mention the naming again

    }

    /**
     * @param {Number} direction positive or negative step, +1 or -1
     */
    setPayroll (direction) {
      this.date.setMonth(this.payroll.startMonth + direction, this.payrollStarts);

      if (this.today.getTime() > new Date(this.date).setMonth(this.startMonthOf(this.date), this.payrollStarts) &&
          this.today.getTime() < new Date(this.date).setMonth(this.startMonthOf(this.date) + 1, this.payrollStarts)) {
        this.date = new Date(this.today);
      }

      this.dateKey = Period.getDayDateSplit_key(this.date);
      //Reset dates
      document.getElementById(sectionPayrollId).querySelectorAll('select[name]').forEach(e=>e.querySelectorAll('option').forEach(e=>e.remove()));
      document.getElementById('dateList').querySelectorAll('div').forEach(e=>e.remove());
      this.payroll = this.getPayroll();
      this.preSelectedDate = this.date.getDate();
      this.init();
    }

    startMonthOf(date) {
      if (date.getDate() >= this.payrollStarts) {
        return date.getMonth();
      } else {
        return date.getMonth() - 1;
      }
    }

    static getMonthLength (date) {
      if (!(date instanceof Date)) return null;
        const newDate = new Date(date);
        newDate.setMonth(date.getMonth(), 32);
        return 32 - newDate.getDate();
    }

    static generateMonthStrFromDate() {
      let dateIter = new Date(0);
      const result = [];
      for (let i = 0; i < 12; i++) {
        dateIter.setMonth(i);
        result.push(dateIter.toString().split(' ')[1]);
      }
      return result;
    }
  }
})()