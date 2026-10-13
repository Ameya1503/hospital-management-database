import React from 'react';
import { Activity, ShieldCheck, Users, Clock, ArrowRight } from 'lucide-react';

const HomePage = () => {
  return (
    <div className="space-y-12 py-10">
      {/* Hero Section */}
      <div className="text-center space-y-6 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-sm font-bold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            System Operational
        </div>
        <h1 className="text-6xl font-extrabold text-slate-900 leading-tight tracking-tight">
          Healthcare <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Simplified.</span>
        </h1>
        <p className="text-xl text-slate-500 leading-relaxed">
          A next-generation hospital management platform connecting patients, doctors, and administrators in one seamless ecosystem.
        </p>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
            { icon: Users, title: "Patient-First", desc: "Book appointments instantly and access your medical history anytime.", color: "text-blue-500", bg: "bg-blue-50" },
            { icon: Activity, title: "Clinical Excellence", desc: "Advanced tools for doctors to track patient compliance and prescriptions.", color: "text-emerald-500", bg: "bg-emerald-50" },
            { icon: ShieldCheck, title: "Secure & Reliable", desc: "Enterprise-grade security with role-based access and data encryption.", color: "text-violet-500", bg: "bg-violet-50" }
        ].map((feature, idx) => (
            <div key={idx} className="group bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className={`w-14 h-14 ${feature.bg} ${feature.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                    <feature.icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">{feature.title}</h3>
                <p className="text-slate-500 leading-relaxed">{feature.desc}</p>
            </div>
        ))}
      </div>

      {/* Stats Section */}
      <div className="bg-slate-900 rounded-3xl p-12 text-white shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="text-center md:text-left">
            <h2 className="text-3xl font-bold mb-2">Trusted by the best.</h2>
            <p className="text-slate-400">Powering modern healthcare facilities.</p>
        </div>
        <div className="flex gap-12">
            {[
                { label: "Doctors", val: "10+" },
                { label: "Patients", val: "5k+" },
                { label: "Records", val: "1M+" },
            ].map((stat, i) => (
                <div key={i} className="text-center">
                    <p className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">{stat.val}</p>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mt-1">{stat.label}</p>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default HomePage;